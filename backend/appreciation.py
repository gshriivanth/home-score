"""
appreciation.py — XGBoost future valuation inference (v2).


Inference pipeline
------------------
1. Fetch live FRED macro data (mortgage_rate, fed_funds, unemployment, CPI)
2. Fetch Census ACS features for the property ZIP (income, commute_time,
   pct_bachelors, racial_diversity_index) — caller passes these in listing dict
3. Build a 12-element feature vector using target-encoded zip/state/county
   from the maps stored in preprocess_meta.json
4. Impute missing values with training medians (from preprocess_meta.json)
5. Run model for 3 horizons (6 / 12 / 36 months) × 3 scenarios (best / avg / worst)

Feature vector order (from preprocess_meta.json):
    horizon_months, income, commute_time, pct_bachelors,
    racial_diversity_index, mortgage_rate, fed_funds,
    unemployment, CPI, zip_te, state_te, county_te

FRED series used
----------------
 mortgage_rate  → MORTGAGE30US  (30-year fixed, weekly)
 fed_funds      → FEDFUNDS      (effective rate, monthly)
 unemployment   → UNRATE        (unemployment rate, monthly)
 CPI            → CPIAUCSL      (Consumer Price Index, monthly)
"""
from __future__ import annotations


import json
from pathlib import Path
from typing import Optional


import httpx


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------


_MODELS_DIR = Path(__file__).parent.parent / "models"


# ---------------------------------------------------------------------------
# Scenario macro perturbations (deltas added to live FRED values)
# ---------------------------------------------------------------------------


_SCENARIO_DELTAS: dict[str, dict[str, float]] = {
   "best":  {"mortgage_rate": -1.5, "fed_funds": -1.0, "unemployment": -1.5},
   "avg":   {"mortgage_rate":  0.0, "fed_funds":  0.0, "unemployment":  0.0},
   "worst": {"mortgage_rate": +2.0, "fed_funds": +1.5, "unemployment": +2.0},
}


# FRED series IDs for each macro field
_FRED_SERIES: dict[str, str] = {
   "mortgage_rate": "MORTGAGE30US",
   "fed_funds":     "FEDFUNDS",
   "unemployment":  "UNRATE",
   "CPI":           "CPIAUCSL",
}


_FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"




# ---------------------------------------------------------------------------
# Startup: load model + preprocessing metadata
# ---------------------------------------------------------------------------


def load_model_artifacts():
   """
   Load the XGBoost model (joblib) and preprocessing metadata (JSON).
   Call once at application startup and store on app.state.
   Returns (model, meta_dict).
   """
   import joblib  # imported here to keep the module importable without joblib installed


   model = joblib.load(_MODELS_DIR / "appreciation_xgb.joblib")
   with open(_MODELS_DIR / "preprocess_meta.json") as f:
       meta = json.load(f)
   return model, meta




# ---------------------------------------------------------------------------
# FRED: fetch live macro values
# ---------------------------------------------------------------------------


async def fetch_fred_macros(api_key: str) -> dict[str, Optional[float]]:
   """
   Fetch the most recent observation for each FRED series.
   Returns a dict with keys: mortgage_rate, fed_funds, unemployment, CPI.
   Any series that fails returns None (caller falls back to training median).
   """
   results: dict[str, Optional[float]] = {k: None for k in _FRED_SERIES}


   async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
       for field, series_id in _FRED_SERIES.items():
           try:
               resp = await client.get(
                   _FRED_BASE,
                   params={
                       "series_id":   series_id,
                       "api_key":     api_key,
                       "file_type":   "json",
                       "sort_order":  "desc",
                       "limit":       1,
                   },
               )
               resp.raise_for_status()
               obs = resp.json().get("observations", [])
               if obs and obs[0]["value"] not in (".", ""):
                   results[field] = float(obs[0]["value"])
           except Exception:
               pass  # stays None; caller uses training median


   return results




# ---------------------------------------------------------------------------
# Feature vector construction
# ---------------------------------------------------------------------------


def _resolve_macro(
   macros: dict[str, Optional[float]],
   field: str,
   meta: dict,
) -> float:
   """Return live macro value, falling back to training median if unavailable."""
   val = macros.get(field)
   if val is not None:
       return val
   idx = meta["num_cols"].index(field)
   return float(meta["num_imputer_medians"][idx])




def _build_feature_vector(
   listing: dict,
   macros: dict[str, Optional[float]],
   meta: dict,
   horizon_months: int,
) -> list[float]:
   """
   Build the 12-element feature vector matching the v2 training pipeline.

   Feature order (from preprocess_meta.json):
       horizon_months, income, commute_time, pct_bachelors,
       racial_diversity_index, mortgage_rate, fed_funds,
       unemployment, CPI, zip_te, state_te, county_te

   zip/state/county are target-encoded using the maps stored in
   preprocess_meta.json. Unseen values fall back to the imputer median.
   ACS features (income, commute_time, pct_bachelors, racial_diversity_index)
   are passed in the listing dict by the caller; missing values fall back
   to training medians.
   """
   num_cols = meta["num_cols"]
   medians  = meta["num_imputer_medians"]
   te_maps  = meta.get("target_encode_maps", {})

   # Target-encode zip / state / county
   zip_str    = str(listing.get("zip")    or "").strip().zfill(5)
   state_str  = str(listing.get("state")  or "").strip()
   county_str = str(listing.get("county") or "").strip()

   zip_te    = te_maps.get("zip",    {}).get(zip_str,    None)
   state_te  = te_maps.get("state",  {}).get(state_str,  None)
   county_te = te_maps.get("county", {}).get(county_str, None)

   raw_numeric: dict[str, Optional[float]] = {
       "horizon_months":         float(horizon_months),
       "income":                 listing.get("income"),
       "commute_time":           listing.get("commute_time"),
       "pct_bachelors":          listing.get("pct_bachelors"),
       "racial_diversity_index": listing.get("racial_diversity_index"),
       "mortgage_rate":          _resolve_macro(macros, "mortgage_rate", meta),
       "fed_funds":              _resolve_macro(macros, "fed_funds",     meta),
       "unemployment":           _resolve_macro(macros, "unemployment",  meta),
       "CPI":                    _resolve_macro(macros, "CPI",           meta),
       "zip_te":                 zip_te,
       "state_te":               state_te,
       "county_te":              county_te,
   }

   vector: list[float] = []
   for i, col in enumerate(num_cols):
       val = raw_numeric.get(col)
       vector.append(float(val) if val is not None else float(medians[i]))

   expected = len(meta["feature_names"])
   if len(vector) != expected:
       raise ValueError(
           f"Feature vector length {len(vector)} does not match "
           f"expected {expected} from preprocess_meta.json"
       )

   return vector




# ---------------------------------------------------------------------------
# Main inference: 3 horizons × 3 scenarios
# ---------------------------------------------------------------------------


def predict_scenarios(
   listing: dict,
   macros: dict[str, Optional[float]],
   model,
   meta: dict,
) -> list[dict]:
   """
   Run appreciation predictions for every (horizon, scenario) combination.


   Returns a list of dicts shaped as HorizonProjection:
       [
         {
           "months": 6,
           "best":  {"appreciation_pct": 3.2, "projected_value": 825600},
           "avg":   {"appreciation_pct": 1.8, "projected_value": 814400},
           "worst": {"appreciation_pct": -0.5, "projected_value": 796000},
         },
         ... (12 months, 36 months)
       ]
   """
   base_price: Optional[float] = listing.get("price")
   results: list[dict] = []


   for horizon in (6, 12, 36):
       horizon_result: dict = {"months": horizon}


       for scenario, deltas in _SCENARIO_DELTAS.items():
           # Perturb macro inputs; CPI is held constant across scenarios
           perturbed: dict[str, float] = {
               "mortgage_rate": _resolve_macro(macros, "mortgage_rate", meta) + deltas["mortgage_rate"],
               "fed_funds":     _resolve_macro(macros, "fed_funds",     meta) + deltas["fed_funds"],
               "unemployment":  _resolve_macro(macros, "unemployment",  meta) + deltas["unemployment"],
               "CPI":           _resolve_macro(macros, "CPI",           meta),
           }


           vec = _build_feature_vector(listing, perturbed, meta, horizon)
           appreciation_pct = float(model.predict([vec])[0])


           projected_value: Optional[int] = (
               round(base_price * (1.0 + appreciation_pct / 100.0))
               if base_price else None
           )


           horizon_result[scenario] = {
               "appreciation_pct": round(appreciation_pct, 2),
               "projected_value":  projected_value,
           }


       results.append(horizon_result)


   return results



