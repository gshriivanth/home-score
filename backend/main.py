"""
HomeScore FastAPI backend.

Endpoints
---------
GET  /health                  — liveness probe
POST /rank-zips               — ranked ZIPs with raw scores and feature breakdown
POST /rank-neighborhoods      — same data shaped for the React frontend Neighborhood[]

Data sources
------------
1. US Census ACS 5-year  — https://api.census.gov/data/{year}/acs/acs5
   Features: income, median_rent, median_home_value, commute_time, pct_bachelors

2. FBI Crime Data Explorer — https://api.usa.gov/crime/fbi/cde
   Features: violent_crime_rate, property_crime_rate

3. NCES Education Data Portal — https://educationdata.urban.org/api/v1
   Features: avg_proficiency_rate

Run
---
    uvicorn main:app --reload --port 8000

Or directly:
    python main.py
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from dotenv import load_dotenv
load_dotenv()  # MUST be before any local imports that read os.getenv() at module level

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from census import SUPPORTED_FEATURES as _ACS_FEATURES
from census import STATE_FIPS, fetch_acs_data
from fbi import SUPPORTED_FEATURES as _CRIME_FEATURES
from fbi import fetch_crime_data
from geo import lookup_zip_centroids, lookup_zips_for_city
from listings import generate_listings
from models import (
    AppreciationPredictionRequest,
    AppreciationPredictionResponse,
    FeatureBreakdown,
    HorizonProjection,
    NeighborhoodLocation,
    NeighborhoodResult,
    RankNeighborhoodsResponse,
    RankZipsRequest,
    RankZipsResponse,
    RankedZip,
    ScenarioResult,
)
from schools import SUPPORTED_FEATURES as _SCHOOL_FEATURES
from schools import fetch_school_data
from scoring import rank_zips
from appreciation import fetch_fred_macros, load_model_artifacts, predict_scenarios


CENSUS_API_KEY: str = os.getenv("CENSUS_API_KEY", "")
FBI_API_KEY: str = os.getenv("FBI_API_KEY", "")
# GREATSCHOOLS_API_KEY removed — switched to NCES Education Data Portal (keyless)
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
FRED_API_KEY: str = os.getenv("FRED_API_KEY", "")

# Combined set of all features supported across all three data sources
ALL_SUPPORTED_FEATURES = _ACS_FEATURES | _CRIME_FEATURES | _SCHOOL_FEATURES

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------

app = FastAPI(
    title="HomeScore API",
    description="ZIP-level neighborhood ranking via US Census ACS 5-year data.",
    version="0.1.0",
)

# Allow both local Vite dev server and the GitHub Pages deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://gshriivanth.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup: Load appreciation model
# ---------------------------------------------------------------------------

_ZIP_LIMIT = 50  # max ZIPs scored per request — keeps FBI/NCES fetches fast


@app.on_event("startup")
async def startup_event():
    """Load ML model artifacts and pre-warm Census ACS cache at startup."""
    # Load appreciation model
    try:
        model, meta = load_model_artifacts()
        app.state.appreciation_model = model
        app.state.appreciation_meta = meta
        print("[STARTUP] Loaded appreciation model successfully")
    except Exception as e:
        print(f"[STARTUP] Warning: Could not load appreciation model: {e}")
        app.state.appreciation_model = None
        app.state.appreciation_meta = None

    # Pre-warm ACS cache — downloads the ~33k-ZCTA national dataset once so
    # the first user request hits the cache instead of waiting 15-30 seconds.
    try:
        print("[STARTUP] Pre-warming Census ACS cache (this takes ~15-30s once)...")
        await fetch_acs_data(
            zctas=[],
            feature_names=list(_ACS_FEATURES),
            state_fips="",
            year=2022,
            api_key=CENSUS_API_KEY,
        )
        print("[STARTUP] Census ACS cache ready")
    except Exception as e:
        print(f"[STARTUP] ACS pre-warm failed (will retry on first request): {e}")

# ---------------------------------------------------------------------------
# Shared pipeline logic
# ---------------------------------------------------------------------------

async def _run_pipeline(req: RankZipsRequest) -> tuple[list, list[str]]:
    """
    Resolve ZIPs → fetch Census ACS + FBI CDE + NCES school data → score.
    Shared by both /rank-zips and /rank-neighborhoods.

    Census ACS is a hard dependency (fails the request if unavailable).
    FBI CDE and NCES are soft dependencies (missing data is imputed to
    the city mean z-score of 0 with a warning added to the response).
    """
    warnings: List[str] = []

    # Validate state
    state_upper = req.state.upper().strip()
    if state_upper not in STATE_FIPS:
        raise HTTPException(status_code=400, detail=f"Unknown US state: '{req.state}'.")
    state_fips = STATE_FIPS[state_upper]

    # Validate feature names against all three data sources
    for feat in req.features:
        if feat.name not in ALL_SUPPORTED_FEATURES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported feature '{feat.name}'. "
                    f"Supported: {sorted(ALL_SUPPORTED_FEATURES)}"
                ),
            )

    # Note normalised weights (model_validator already did the maths)
    weight_sum = sum(f.weight for f in req.features)
    if abs(weight_sum - 1.0) > 0.001:
        warnings.append(
            f"Weights normalised from sum={weight_sum:.4f} to 1.0."
        )

    # Resolve ZIPs
    zip_list = req.zip_list or []
    if not zip_list:
        resolved = await lookup_zips_for_city(req.city, req.state)
        if resolved:
            zip_list = resolved
            warnings.append(
                f"Auto-resolved {len(zip_list)} ZIP codes for {req.city}, {req.state}."
            )
        else:
            warnings.append(
                f"Could not resolve ZIPs for '{req.city}, {req.state}' — "
                "fetching all state ZCTAs (may be slow; provide zip_list for speed)."
            )

    # Cap to keep FBI + NCES fetch times reasonable
    if len(zip_list) > _ZIP_LIMIT:
        zip_list = zip_list[:_ZIP_LIMIT]
        warnings.append(f"Capped to {_ZIP_LIMIT} ZIP codes for performance.")

    # Only pass ACS feature names to the Census client
    acs_feature_names = [f.name for f in req.features if f.name in _ACS_FEATURES]

    # Validate that at least one ACS feature is selected
    if not acs_feature_names:
        acs_feature_list = ", ".join(sorted(_ACS_FEATURES))
        raise HTTPException(
            status_code=400,
            detail=(
                f"At least one Census ACS feature is required for neighborhood ranking. "
                f"Available ACS features: {acs_feature_list}. "
                f"Please select at least one of: Neighborhood Wealth (income), "
                f"Commute (commute_time), Education Level (pct_bachelors), "
                f"Diversity (racial_diversity_index), or Family Friendly (pct_households_children)."
            )
        )

    # Debug logging
    print(f"[DEBUG] City: {req.city}, State: {req.state}")
    print(f"[DEBUG] ZIP list ({len(zip_list)} ZIPs): {zip_list[:10]}...")
    print(f"[DEBUG] ACS feature names: {acs_feature_names}")

    # --- Stage 1: Census ACS (required - at least one ACS feature must be selected) ---
    try:
        acs_data = await fetch_acs_data(
            zctas=zip_list,
            feature_names=acs_feature_names,
            state_fips=state_fips,
            year=req.acs_year,
            api_key=CENSUS_API_KEY,
        )
        print(f"[DEBUG] ACS data returned: {len(acs_data)} ZCTAs")
    except Exception as exc:
        print(f"[DEBUG] Census API exception: {exc}")
        raise HTTPException(status_code=502, detail=f"Census API error: {exc}")

    if not acs_data:
        print(f"[DEBUG] NO ACS DATA - zip_list had {len(zip_list)} ZIPs")
        raise HTTPException(
            status_code=404,
            detail=(
                f"No ACS data found for the requested ZIPs in "
                f"{req.city}, {req.state} ({req.acs_year})."
            ),
        )

    # Use ZCTAs that ACS returned as the authoritative ZIP list
    scored_zctas = list(acs_data.keys())

    # Warn about ZCTAs missing individual ACS features
    for zcta, feats in acs_data.items():
        missing = [fn for fn, val in feats.items() if val is None]
        if missing:
            warnings.append(
                f"ZIP {zcta}: no Census data for {missing} — imputed with city mean (z=0)."
            )

    # --- Stage 2: FBI CDE + NCES schools (soft fail, run concurrently) --------
    crime_result, school_result = await asyncio.gather(
        fetch_crime_data(scored_zctas, FBI_API_KEY, year=req.acs_year),
        fetch_school_data(scored_zctas),
        return_exceptions=True,
    )

    if isinstance(crime_result, Exception):
        warnings.append("FBI CDE API unavailable — crime features imputed to city mean (z=0).")
        crime_data: Dict = {}
    else:
        crime_data = crime_result  # type: ignore[assignment]
        if not FBI_API_KEY:
            warnings.append("FBI_API_KEY not set — crime features imputed to city mean (z=0).")

    if isinstance(school_result, Exception):
        warnings.append("NCES API unavailable — school proficiency imputed to city mean (z=0).")
        school_data: Dict = {}
    else:
        school_data = school_result  # type: ignore[assignment]

    # --- Merge all feature sources into one dict per ZCTA -------------------
    for zcta in scored_zctas:
        acs_data[zcta].update(crime_data.get(zcta, {}))
        acs_data[zcta].update(school_data.get(zcta, {}))

    # --- Fetch national ACS data for z-score normalisation ------------------
    # The Census API always returns all ZCTAs nationally (raw_rows are cached),
    # so passing zctas=[] just skips the client-side filter — no extra network call.
    national_acs_data: Dict = {}
    try:
        national_acs_data = await fetch_acs_data(
            zctas=[],
            feature_names=acs_feature_names,
            state_fips=state_fips,
            year=req.acs_year,
            api_key=CENSUS_API_KEY,
        )
    except Exception:
        warnings.append("Could not load national ACS reference — z-scores normalised within city only.")

    # --- Stage 3: Score -----------------------------------------------------
    feature_configs = [
        {"name": f.name, "weight": f.weight, "higher_is_better": f.higher_is_better}
        for f in req.features
    ]
    ranked, score_warnings = rank_zips(acs_data, feature_configs, reference_data=national_acs_data or None)
    warnings.extend(score_warnings)

    return ranked, warnings


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
async def health() -> Dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /rank-zips
# ---------------------------------------------------------------------------

@app.post("/rank-zips", response_model=RankZipsResponse, tags=["ranking"])
async def rank_zips_endpoint(req: RankZipsRequest) -> RankZipsResponse:
    """
    Rank ZIPs for a US city by a weighted combination of ACS 5-year features.

    Weights are normalised server-side; missing data is imputed to city mean.
    Results are sorted by descending composite score.
    """
    ranked, warnings = await _run_pipeline(req)

    ranked_zips: List[RankedZip] = []
    for r in ranked:
        features: Dict[str, FeatureBreakdown] = {}
        for fname, bd in r["features"].items():
            features[fname] = FeatureBreakdown(
                raw_value=bd["raw_value"],
                z_score=bd["z_score"],
                weight=bd["weight"],
                contribution=bd["contribution"],
            )
        ranked_zips.append(
            RankedZip(zip=r["zip"], rank=r["rank"], score=r["score"], features=features)
        )

    return RankZipsResponse(
        city=req.city,
        state=req.state,
        year=req.acs_year,
        total_zips_scored=len(ranked_zips),
        ranked_zips=ranked_zips,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# POST /rank-neighborhoods  (frontend-compatible shape)
# ---------------------------------------------------------------------------

# Map score percentile → human-readable tags
def _score_tags(score: float, all_scores: List[float], features: Dict) -> List[str]:
    """Generate simple tags based on which features contributed most."""
    tags: List[str] = []

    # Rank among all ZCTAs
    if all_scores:
        pct = sum(s < score for s in all_scores) / len(all_scores)
        if pct >= 0.8:
            tags.append("Top-ranked area")
        elif pct >= 0.5:
            tags.append("Above average")

    # Per-feature highlights (positive contribution = feature is good here)
    label_map = {
        "income":                  "High income",
        "commute_time":            "Short commute",
        "pct_bachelors":           "Highly educated",
        "violent_crime_rate":      "Low violent crime",
        "property_crime_rate":     "Low property crime",
        "avg_proficiency_rate":    "Top-rated schools",
        "racial_diversity_index":  "Diverse community",
        "pct_households_children": "Family-friendly",
    }
    sorted_features = sorted(
        features.items(), key=lambda kv: kv[1].get("contribution", 0), reverse=True
    )
    for fname, bd in sorted_features[:2]:
        contribution = bd.get("contribution", 0)
        if contribution and contribution > 0:
            tags.append(label_map.get(fname, fname))

    return tags or ["Scored area"]


def _score_to_match(score: float, all_scores: List[float]) -> float:
    """
    Map raw weighted z-score to a 0–100 matchScore using a sigmoid.

    Because z-scores are now normalised against the national ZCTA distribution,
    the output is comparable across cities:
      score =  0  →  50%  (national average across selected features)
      score =  1  →  73%  (~1 std above national average)
      score =  2  →  88%  (~2 std above national average)
      score = -1  →  27%  (~1 std below national average)
    """
    import math
    return round(100.0 / (1.0 + math.exp(-score)), 1)


@app.post("/rank-neighborhoods", response_model=RankNeighborhoodsResponse, tags=["ranking"])
async def rank_neighborhoods_endpoint(req: RankZipsRequest) -> RankNeighborhoodsResponse:
    """
    Same ranking pipeline as /rank-zips, but response is shaped to match
    the frontend's Neighborhood[] interface:

        { id, name, matchScore, tags, location, zip, score, features }

    Location is populated from ZIP centroid lookups via Zippopotam.us.
    If lookup fails for a ZIP, location falls back to (0, 0).
    """
    ranked, warnings = await _run_pipeline(req)

    all_scores = [r["score"] for r in ranked]
    ranked_zip_codes = [r["zip"] for r in ranked]
    zip_centroids = await lookup_zip_centroids(ranked_zip_codes)
    missing_coords = [z for z in ranked_zip_codes if z not in zip_centroids]
    if missing_coords:
        warnings.append(
            f"Could not resolve coordinates for {len(missing_coords)} ZIP(s); "
            "those markers use map fallback positions."
        )

    neighborhoods: List[NeighborhoodResult] = []
    for r in ranked:
        features_bd: Dict[str, FeatureBreakdown] = {}
        for fname, bd in r["features"].items():
            features_bd[fname] = FeatureBreakdown(
                raw_value=bd["raw_value"],
                z_score=bd["z_score"],
                weight=bd["weight"],
                contribution=bd["contribution"],
            )

        match_score = _score_to_match(r["score"], all_scores)
        tags = _score_tags(r["score"], all_scores, r["features"])

        neighborhoods.append(
            NeighborhoodResult(
                id=r["zip"],
                name=f"ZIP {r['zip']}",
                matchScore=match_score,
                tags=tags,
                location=NeighborhoodLocation(
                    lat=zip_centroids.get(r["zip"], (0.0, 0.0))[0],
                    lng=zip_centroids.get(r["zip"], (0.0, 0.0))[1],
                ),
                zip=r["zip"],
                score=r["score"],
                features=features_bd,
            )
        )

    return RankNeighborhoodsResponse(
        city=req.city,
        state=req.state,
        year=req.acs_year,
        total_zips_scored=len(neighborhoods),
        neighborhoods=neighborhoods,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# POST /listings  (Gemini-powered Zillow-style listing generator)
# ---------------------------------------------------------------------------

class ListingRequest(BaseModel):
    zip_code: str
    city: str
    state: str
    bedrooms: int = 3
    bathrooms: float = 2.0
    min_price: int = 400_000
    max_price: int = 800_000
    sqft_min: int = 1_000
    sqft_max: int = 3_000
    property_type: str = "any"
    garage: bool = False
    pool: bool = False
    year_built: str = "any"
    seen_ids: List[str] = []


@app.post("/listings", tags=["listings"])
async def get_listing(req: ListingRequest) -> Dict:
    """
    Return up to 5 active for-sale listings for the given ZIP code
    scraped from Redfin.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY not configured on the server. Add it to backend/.env.",
        )
    try:
        result = await generate_listings(
            zip_code=req.zip_code,
            city=req.city,
            state=req.state,
            bedrooms=req.bedrooms,
            bathrooms=req.bathrooms,
            min_price=req.min_price,
            max_price=req.max_price,
            sqft_min=req.sqft_min,
            sqft_max=req.sqft_max,
            property_type=req.property_type,
            garage=req.garage,
            pool=req.pool,
            year_built=req.year_built,
            seen_ids=req.seen_ids,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Listings error: {exc}")


# ---------------------------------------------------------------------------
# POST /predict-appreciation
# ---------------------------------------------------------------------------

@app.post("/predict-appreciation", response_model=AppreciationPredictionResponse, tags=["predictions"])
async def predict_appreciation(req: AppreciationPredictionRequest) -> AppreciationPredictionResponse:
    """
    Predict house appreciation for 6, 12, and 36 months under best/avg/worst scenarios.

    Uses XGBoost model trained on historical house sales data and FRED macroeconomic indicators.
    Returns percentage appreciation and projected values for each scenario/horizon combination.
    """
    warnings: List[str] = []

    # Check if model loaded successfully
    if app.state.appreciation_model is None or app.state.appreciation_meta is None:
        raise HTTPException(
            status_code=503,
            detail="Appreciation model not loaded. Check server startup logs."
        )

    # Fetch live FRED macro data (or fall back to training medians)
    if not FRED_API_KEY:
        warnings.append("FRED_API_KEY not set — using training median macro values.")
        macros = {}
    else:
        try:
            macros = await fetch_fred_macros(FRED_API_KEY)
        except Exception as e:
            warnings.append(f"FRED API error: {e} — using training median macro values.")
            macros = {}

    # Fetch ACS features for the ZIP (v2 model uses these instead of property-level features)
    acs_zip_features: Dict = {}
    try:
        state_upper = req.state.upper().strip()
        zip_state_fips = STATE_FIPS.get(state_upper, "")
        if zip_state_fips and req.zip:
            acs_result = await fetch_acs_data(
                zctas=[req.zip],
                feature_names=["income", "commute_time", "pct_bachelors", "racial_diversity_index"],
                state_fips=zip_state_fips,
                year=2022,
                api_key=CENSUS_API_KEY,
            )
            acs_zip_features = acs_result.get(req.zip, {})
    except Exception as acs_err:
        warnings.append(f"ACS lookup for ZIP {req.zip} failed: {acs_err} — using training median features.")

    # Build listing dict from request
    listing = {
        "price": req.price,
        "zip": req.zip,
        "state": req.state,
        "county": req.county,
        # ACS features used by v2 model
        "income":                 acs_zip_features.get("income"),
        "commute_time":           acs_zip_features.get("commute_time"),
        "pct_bachelors":          acs_zip_features.get("pct_bachelors"),
        "racial_diversity_index": acs_zip_features.get("racial_diversity_index"),
    }

    # Run predictions
    try:
        raw_results = predict_scenarios(
            listing=listing,
            macros=macros,
            model=app.state.appreciation_model,
            meta=app.state.appreciation_meta,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction error: {e}"
        )

    # Convert to Pydantic models
    projections: List[HorizonProjection] = []
    for r in raw_results:
        projections.append(
            HorizonProjection(
                months=r["months"],
                best=ScenarioResult(**r["best"]),
                avg=ScenarioResult(**r["avg"]),
                worst=ScenarioResult(**r["worst"]),
            )
        )

    return AppreciationPredictionResponse(
        projections=projections,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# POST /generate-summary  (Gemini AI pipeline explanation)
# ---------------------------------------------------------------------------

_PRIORITY_LABELS: Dict[str, str] = {
    "violent_crime_rate":      "Safety (low violent crime)",
    "property_crime_rate":     "Safety (low property crime)",
    "avg_proficiency_rate":    "School quality",
    "income":                  "Neighborhood wealth / median income",
    "commute_time":            "Short commute",
    "pct_bachelors":           "Education level (% with bachelor's degree)",
    "racial_diversity_index":  "Diversity",
    "pct_households_children": "Family-friendly environment",
}

_FEATURE_LABELS: Dict[str, str] = {
    "income":                  "Median Household Income",
    "commute_time":            "Average Commute Time (minutes)",
    "pct_bachelors":           "% of Residents with Bachelor's Degree",
    "racial_diversity_index":  "Racial Diversity Index (0=homogeneous, 1=fully diverse)",
    "pct_households_children": "% of Households with Children under 18",
    "violent_crime_rate":      "Violent Crime Rate (per 100,000 residents)",
    "property_crime_rate":     "Property Crime Rate (per 100,000 residents)",
    "avg_proficiency_rate":    "Average School Proficiency Rate (% students proficient in math + reading)",
}

_SUMMARY_SYSTEM_PROMPT = """
You are HomeScore AI. Write exactly 3 plain-prose paragraphs (no headers, bullets, or markdown) summarizing why this home and neighborhood were recommended. Use only numbers from the data provided — never invent figures. Write in second person. Skip any section whose data is absent. Separate paragraphs with a blank line. Target 220–280 words total.

Paragraph 1: Neighborhood match. Name the user's top 1–2 priorities and cite the actual raw values and z-scores that drove the match score.
Paragraph 2: Home fit and monthly costs. Show how the listing specs meet the stated requirements, note standout features, then summarize the total monthly commitment.
Paragraph 3: Appreciation outlook (only if projections are provided). State the average-case prediction in dollars and percent, contrast briefly with best and worst cases.
""".strip()


class SummaryRequest(BaseModel):
    # User preferences
    city: str
    state: str
    ranked_priorities: List[str]
    house_requirements: Dict[str, Any]

    # Neighborhood
    neighborhood_name: str
    neighborhood_match_score: float
    neighborhood_zip: str
    neighborhood_tags: List[str]
    neighborhood_features: Optional[Dict[str, Any]] = None

    # Listing
    listing_address: str
    listing_price: int
    listing_bedrooms: int
    listing_bathrooms: float
    listing_sqft: int
    listing_year_built: Optional[int] = None
    listing_property_type: Optional[str] = None
    listing_garage: Optional[bool] = None
    listing_pool: Optional[bool] = None
    listing_stories: Optional[int] = None
    listing_lot_size_sqft: Optional[int] = None
    listing_hoa_monthly: Optional[float] = None
    listing_days_on_market: Optional[int] = None
    listing_price_per_sqft: Optional[float] = None
    listing_description: Optional[str] = None

    # Appreciation predictions
    appreciation_projections: Optional[List[Dict[str, Any]]] = None

    # Monthly cost breakdown (frontend-calculated)
    monthly_mortgage: Optional[float] = None
    monthly_property_tax: Optional[float] = None
    monthly_insurance: Optional[float] = None
    monthly_hoa: Optional[float] = None
    monthly_maintenance: Optional[float] = None


def _build_data_block(req: SummaryRequest) -> str:
    """Format all pipeline data into a structured text block for Gemini."""
    lines: List[str] = []

    lines.append("=== USER PREFERENCES ===")
    lines.append(f"City: {req.city}, {req.state}")
    if req.ranked_priorities:
        lines.append("Ranked Priorities (most → least important):")
        for i, p in enumerate(req.ranked_priorities, 1):
            lines.append(f"  {i}. {_PRIORITY_LABELS.get(p, p)}")

    hr = req.house_requirements
    lines.append("House Requirements:")
    lines.append(f"  Bedrooms: {hr.get('bedrooms', 'any')}")
    lines.append(f"  Bathrooms: {hr.get('bathrooms', 'any')}")
    lines.append(f"  Price range: ${int(hr.get('minPrice', 0)):,} – ${int(hr.get('maxPrice', 0)):,}")
    lines.append(f"  Size: {int(hr.get('sqftMin', 0)):,} – {int(hr.get('sqftMax', 0)):,} sqft")
    if hr.get('propertyType') and hr.get('propertyType') != 'any':
        lines.append(f"  Property type: {hr['propertyType']}")
    if hr.get('garage'):
        lines.append("  Garage: required")
    if hr.get('pool'):
        lines.append("  Pool: required")
    if hr.get('yearBuilt') and hr.get('yearBuilt') != 'any':
        lines.append(f"  Year built preference: {hr['yearBuilt']}")

    lines.append("")
    lines.append(f"=== NEIGHBORHOOD ANALYSIS: {req.neighborhood_name} ===")
    lines.append(f"ZIP Code: {req.neighborhood_zip}")
    lines.append(f"Match Score: {req.neighborhood_match_score:.1f} / 100")
    lines.append(f"Highlights: {', '.join(req.neighborhood_tags)}")

    if req.neighborhood_features:
        lines.append("")
        lines.append("Scoring Methodology: Z-score normalization against national ZCTA distribution.")
        lines.append("  score=0 → national average; score=+1 → top 27% nationally; score=–1 → bottom 27%.")
        lines.append("  Weighted sum of directional z-scores → sigmoid → 0–100 match score.")
        lines.append("")
        lines.append("Feature Breakdown:")
        for fname, bd in req.neighborhood_features.items():
            label = _FEATURE_LABELS.get(fname, fname)
            raw = bd.get('raw_value')
            z = bd.get('z_score')
            w = bd.get('weight', 0)
            contrib = bd.get('contribution')
            parts = [f"  {label}:"]
            if raw is not None:
                if fname == 'income':
                    parts.append(f"raw value = ${raw:,.0f}")
                elif fname == 'commute_time':
                    parts.append(f"raw value = {raw:.1f} min")
                elif fname in ('pct_bachelors', 'pct_households_children', 'racial_diversity_index'):
                    parts.append(f"raw value = {raw * 100:.1f}%")
                else:
                    parts.append(f"raw value = {raw:.2f}")
            if z is not None:
                lines_suffix = "above" if z >= 0 else "below"
                lines.append(
                    " | ".join(parts)
                    + f" | z-score = {z:+.2f} ({abs(z):.2f}σ {lines_suffix} national avg)"
                    + f" | weight = {w * 100:.0f}%"
                    + (f" | contribution = {contrib:+.3f}" if contrib is not None else "")
                )
                parts = []  # already appended
            else:
                lines.append(" | ".join(parts) + f" | weight = {w * 100:.0f}%")
                parts = []

    lines.append("")
    lines.append("=== SELECTED LISTING ===")
    lines.append(f"Address: {req.listing_address}")
    lines.append(f"Asking Price: ${req.listing_price:,}")
    lines.append(f"Bedrooms: {req.listing_bedrooms}  |  Bathrooms: {req.listing_bathrooms}")
    lines.append(f"Interior: {req.listing_sqft:,} sqft")
    if req.listing_year_built:
        lines.append(f"Year Built: {req.listing_year_built}")
    if req.listing_property_type:
        lines.append(f"Property Type: {req.listing_property_type}")
    if req.listing_lot_size_sqft:
        lines.append(f"Lot Size: {req.listing_lot_size_sqft:,} sqft")
    if req.listing_price_per_sqft:
        lines.append(f"Price per sqft: ${req.listing_price_per_sqft:.0f}")
    feats = [f for f, flag in [("garage", req.listing_garage), ("pool", req.listing_pool)] if flag]
    if feats:
        lines.append(f"Features: {', '.join(feats)}")
    if req.listing_hoa_monthly:
        lines.append(f"HOA: ${req.listing_hoa_monthly:.0f}/month")
    if req.listing_days_on_market is not None:
        lines.append(f"Days on Market: {req.listing_days_on_market}")
    if req.listing_description:
        lines.append(f"Listing Description: {req.listing_description}")

    if req.appreciation_projections:
        lines.append("")
        lines.append("=== APPRECIATION PREDICTIONS (XGBoost ML Model + FRED Macro Data) ===")
        lines.append("Model: XGBoost regression trained on historical US home sales transactions.")
        lines.append("Macro inputs (live from Federal Reserve / FRED): 30-year mortgage rate, fed funds rate, unemployment rate, CPI.")
        lines.append("Best scenario: mortgage –1.5%, fed funds –1.0%, unemployment –1.5% vs. current.")
        lines.append("Worst scenario: mortgage +2.0%, fed funds +1.5%, unemployment +2.0% vs. current.")
        lines.append("")
        for proj in req.appreciation_projections:
            months = proj.get('months')
            best = proj.get('best', {})
            avg = proj.get('avg', {})
            worst = proj.get('worst', {})
            lines.append(f"  {months}-Month Horizon:")
            for label, scenario in [("Best case", best), ("Average case", avg), ("Worst case", worst)]:
                pct = scenario.get('appreciation_pct', 0)
                val = scenario.get('projected_value')
                val_str = f"  →  projected value ${val:,}" if val else ""
                sign = "+" if pct >= 0 else ""
                lines.append(f"    {label}: {sign}{pct:.1f}%{val_str}")

    if any(x is not None for x in [req.monthly_mortgage, req.monthly_property_tax,
                                     req.monthly_insurance, req.monthly_hoa, req.monthly_maintenance]):
        lines.append("")
        lines.append("=== MONTHLY COST BREAKDOWN ===")
        lines.append("Assumptions: 20% down payment, 7% interest rate, 30-year fixed mortgage.")
        down = int(req.listing_price * 0.20)
        lines.append(f"Down payment required: ${down:,} (20% of ${req.listing_price:,})")
        cost_rows = [
            ("Mortgage (P&I)", req.monthly_mortgage),
            ("Property Tax", req.monthly_property_tax),
            ("Homeowner Insurance", req.monthly_insurance),
            ("HOA Fees", req.monthly_hoa),
            ("Maintenance Reserve", req.monthly_maintenance),
        ]
        total = 0.0
        for name, val in cost_rows:
            if val is not None:
                lines.append(f"  {name}: ${val:,.0f}/month")
                total += val
        if total:
            lines.append(f"  TOTAL monthly commitment: ${total:,.0f}/month")

    return "\n".join(lines)


@app.post("/generate-summary", tags=["summary"])
async def generate_summary(req: SummaryRequest) -> Dict:
    """
    Call Gemini to produce a personalized, plain-prose summary explaining
    why this neighborhood and listing were recommended based on all pipeline
    scores, predictions, and the user's stated preferences.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY not configured on the server.",
        )

    data_block = _build_data_block(req)

    try:
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            config=genai_types.GenerateContentConfig(
                system_instruction=_SUMMARY_SYSTEM_PROMPT,
                temperature=0.55
            ),
            contents=data_block,
        )
        summary_text = response.text or ""
        return {"summary": summary_text.strip()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}")


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=[".venv"])
