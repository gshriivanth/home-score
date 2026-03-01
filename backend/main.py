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
from geo import lookup_zips_for_city
from listings import generate_listings
from models import (
    FeatureBreakdown,
    NeighborhoodLocation,
    NeighborhoodResult,
    RankNeighborhoodsResponse,
    RankZipsRequest,
    RankZipsResponse,
    RankedZip,
)
from schools import SUPPORTED_FEATURES as _SCHOOL_FEATURES
from schools import fetch_school_data
from scoring import rank_zips


CENSUS_API_KEY: str = os.getenv("CENSUS_API_KEY", "")
FBI_API_KEY: str = os.getenv("FBI_API_KEY", "")
GREATSCHOOLS_API_KEY: str = os.getenv("GREATSCHOOLS_API_KEY", "")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

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

    # --- Stage 1: Census ACS (hard fail) ------------------------------------
    try:
        acs_data = await fetch_acs_data(
            zctas=zip_list,
            feature_names=acs_feature_names,
            state_fips=state_fips,
            year=req.acs_year,
            api_key=CENSUS_API_KEY,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Census API error: {exc}")

    if not acs_data:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No ACS data found for the requested ZIPs in "
                f"{req.city}, {req.state} ({req.acs_year})."
            ),
        )

    # Warn about ZCTAs missing individual ACS features
    for zcta, feats in acs_data.items():
        missing = [fn for fn, val in feats.items() if val is None]
        if missing:
            warnings.append(
                f"ZIP {zcta}: no Census data for {missing} — imputed with city mean (z=0)."
            )

    # Use the ZCTAs that ACS returned as the authoritative ZIP list
    scored_zctas = list(acs_data.keys())

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

    # --- Stage 3: Score -----------------------------------------------------
    feature_configs = [
        {"name": f.name, "weight": f.weight, "higher_is_better": f.higher_is_better}
        for f in req.features
    ]
    ranked, score_warnings = rank_zips(acs_data, feature_configs)
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
        "income": "High income",
        "median_rent": "Affordable rent",
        "median_home_value": "Affordable homes",
        "commute_time": "Short commute",
        "pct_bachelors": "Highly educated",
        "violent_crime_rate": "Low violent crime",
        "property_crime_rate": "Low property crime",
        "avg_school_rating": "Top-rated schools",
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
    """Map raw weighted z-score to a 0-100 matchScore for the frontend."""
    if not all_scores:
        return 50.0
    min_s, max_s = min(all_scores), max(all_scores)
    if max_s == min_s:
        return 75.0
    # Linear rescale to [40, 98]
    normalised = (score - min_s) / (max_s - min_s)
    return round(40.0 + normalised * 58.0, 1)


@app.post("/rank-neighborhoods", response_model=RankNeighborhoodsResponse, tags=["ranking"])
async def rank_neighborhoods_endpoint(req: RankZipsRequest) -> RankNeighborhoodsResponse:
    """
    Same ranking pipeline as /rank-zips, but response is shaped to match
    the frontend's Neighborhood[] interface:

        { id, name, matchScore, tags, location, zip, score, features }

    Location is a placeholder centroid (0, 0) — integrate a geocoder or
    ZCTA centroid lookup for real coordinates.
    """
    ranked, warnings = await _run_pipeline(req)

    all_scores = [r["score"] for r in ranked]

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
                location=NeighborhoodLocation(lat=0.0, lng=0.0),  # placeholder
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
async def get_listing(req: ListingRequest) -> Dict:
    """
    Generate a single realistic home listing for the given ZIP code using
    the Gemini + Redfin scraping pipeline. Gemini finds an active listing URL
    via Google Search, then the page is scraped for property details.
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
        return listings[0] if listings else {}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Listings error: {exc}")


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=[".venv"])
