"""
Pydantic models for HomeScore API request/response contracts.
All field names are chosen to align with the frontend's TypeScript interfaces.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, field_validator, model_validator


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class FeatureWeight(BaseModel):
    """One factor contributing to the ZIP score."""
    name: str
    weight: float
    higher_is_better: bool


class RankZipsRequest(BaseModel):
    """
    POST /rank-zips request body.

    Features must reference at least one of the supported ACS feature names:
        income | commute_time | pct_bachelors

    Weights are normalised server-side if they don't sum to exactly 1.0.
    """
    city: str
    state: str
    acs_year: int = 2022
    features: List[FeatureWeight]
    zip_list: Optional[List[str]] = None  # explicit override; auto-resolved when omitted

    @field_validator("features")
    @classmethod
    def at_least_one_feature(cls, v: List[FeatureWeight]) -> List[FeatureWeight]:
        if not v:
            raise ValueError("At least one feature is required.")
        return v

    @model_validator(mode="after")
    def normalise_weights(self) -> "RankZipsRequest":
        total = sum(f.weight for f in self.features)
        if total <= 0:
            raise ValueError("Feature weights must be positive.")
        if abs(total - 1.0) > 1e-6:
            for f in self.features:
                f.weight = f.weight / total
        return self


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class FeatureBreakdown(BaseModel):
    """Per-feature detail for one ZIP code."""
    raw_value: Optional[float]   # Original ACS value (dollars, minutes, ratio…)
    z_score: Optional[float]     # Standardised score (after directionality flip)
    weight: float
    contribution: Optional[float]  # weight × z_score → share of total score


class RankedZip(BaseModel):
    """One ZIP code entry in the ranked results."""
    zip: str
    rank: int
    score: float                           # Weighted sum of directional z-scores
    features: Dict[str, FeatureBreakdown]


class RankZipsResponse(BaseModel):
    """Full response from POST /rank-zips."""
    city: str
    state: str
    year: int
    total_zips_scored: int
    ranked_zips: List[RankedZip]
    warnings: List[str]


# ---------------------------------------------------------------------------
# Frontend-compatible Neighborhood response
# ---------------------------------------------------------------------------
# The React frontend (NeighborhoodRankings.tsx) expects Neighborhood objects
# with the shape below.  POST /rank-neighborhoods returns this format.

class NeighborhoodLocation(BaseModel):
    lat: float
    lng: float


class NeighborhoodResult(BaseModel):
    """Maps one scored ZIP to the frontend Neighborhood interface."""
    id: str                     # ZIP code used as stable ID
    name: str                   # "ZIP 92617" or enriched city/neighbourhood name
    matchScore: float           # 0-100 score for UI display
    tags: List[str]             # Human-readable feature highlights
    location: NeighborhoodLocation
    zip: str                    # Explicit ZIP for downstream filtering
    score: float                # Raw weighted z-score (for sorting / debug)
    features: Dict[str, FeatureBreakdown]


class RankNeighborhoodsResponse(BaseModel):
    city: str
    state: str
    year: int
    total_zips_scored: int
    neighborhoods: List[NeighborhoodResult]
    warnings: List[str]
