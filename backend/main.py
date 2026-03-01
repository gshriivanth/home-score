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

3. GreatSchools            — https://api.greatschools.org
   Features: avg_school_rating

Run
---
    uvicorn main:app --reload --port 8000

Or directly:
    python main.py
"""
from __future__ import annotations

import asyncio
import os
from typing import Dict, List

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
GREATSCHOOLS_API_KEY: str = os.getenv("GREATSCHOOLS_API_KEY", "")
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

@app.on_event("startup")
async def startup_event():
    """Load ML model artifacts at server startup."""
    try:
        model, meta = load_model_artifacts()
        app.state.appreciation_model = model
        app.state.appreciation_meta = meta
        print("[STARTUP] Loaded appreciation model successfully")
    except Exception as e:
        print(f"[STARTUP] Warning: Could not load appreciation model: {e}")
        app.state.appreciation_model = None
        app.state.appreciation_meta = None

# ---------------------------------------------------------------------------
# Shared pipeline logic
# ---------------------------------------------------------------------------

async def _run_pipeline(req: RankZipsRequest) -> tuple[list, list[str]]:
    """
    Resolve ZIPs → fetch Census ACS + FBI CDE + GreatSchools data → score.
    Shared by both /rank-zips and /rank-neighborhoods.

    Census ACS is a hard dependency (fails the request if unavailable).
    FBI CDE and GreatSchools are soft dependencies (missing data is imputed to
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

    # --- Stage 2: FBI CDE + GreatSchools (soft fail, run concurrently) ------
    crime_result, school_result = await asyncio.gather(
        fetch_crime_data(scored_zctas, FBI_API_KEY, year=req.acs_year),
        fetch_school_data(scored_zctas, GREATSCHOOLS_API_KEY),
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
        warnings.append("GreatSchools API unavailable — school rating imputed to city mean (z=0).")
        school_data: Dict = {}
    else:
        school_data = school_result  # type: ignore[assignment]
        if not GREATSCHOOLS_API_KEY:
            warnings.append("GREATSCHOOLS_API_KEY not set — school rating imputed to city mean (z=0).")

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
        "avg_school_rating":       "Top-rated schools",
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


@app.post("/listings", tags=["listings"])
async def get_listing(req: ListingRequest) -> List[Dict]:
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
        listings = await generate_listings(
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
        )
        return listings
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

    # Build listing dict from request
    listing = {
        "price": req.price,
        "sqft": req.sqft,
        "bedrooms": req.bedrooms,
        "bathrooms": req.bathrooms,
        "yearBuilt": req.yearBuilt,
        "propertyType": req.propertyType,
        "zip": req.zip,
        "state": req.state,
        "garage": req.garage,
        "pool": req.pool,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "lot_size_sqft": req.lot_size_sqft,
        "stories": req.stories,
        "county": req.county,
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
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=[".venv"])
