"""
Async Census ACS 5-year API client with in-memory TTL cache.

Supported features and their ACS variable mappings
---------------------------------------------------
income                    B19013_001E                          — median household income ($)
commute_time              B08136_001E / B08303_001E            — mean travel time to work (min)
pct_bachelors             (B15003_022-025E) / B15003_001E      — share of 25+ with bachelor's+
pct_households_children   B11005_002E / B11005_001E            — share of households with children <18
racial_diversity_index    1 - Σ(B02001_00xE/total)²           — Herfindahl diversity index (0=homogeneous, 1=diverse)
"""
from __future__ import annotations

import asyncio
import time
from typing import Dict, List, Optional, Tuple

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CENSUS_BASE = "https://api.census.gov/data"
ACS_DATASET = "acs/acs5"
CACHE_TTL_SECONDS = 12 * 3600  # 12 hours

# Sentinel value the Census API uses for suppressed / unavailable cells
_CENSUS_NULL_SENTINEL = {"-666666666", "-666666666.0", -666666666, -666666666.0}

# All raw ACS variables we ever fetch, grouped by derived feature name
_FEATURE_VARS: Dict[str, List[str]] = {
    "income":                  ["B19013_001E"],
    "commute_time":            ["B08136_001E", "B08303_001E"],  # aggregate minutes, total commuters
    "pct_bachelors":           ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E",
                                "B15003_001E"],
    "pct_households_children": ["B11005_002E", "B11005_001E"],  # with_children, total households
    "racial_diversity_index":  ["B02001_001E",  # total population
                                "B02001_002E",  # White alone
                                "B02001_003E",  # Black or African American alone
                                "B02001_004E",  # American Indian and Alaska Native alone
                                "B02001_005E",  # Asian alone
                                "B02001_006E",  # Native Hawaiian and Other Pacific Islander alone
                                "B02001_007E",  # Some other race alone
                                "B02001_008E"], # Two or more races
}

SUPPORTED_FEATURES = set(_FEATURE_VARS.keys())

# Two-letter state abbreviation → Census FIPS code
STATE_FIPS: Dict[str, str] = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06",
    "CO": "08", "CT": "09", "DE": "10", "DC": "11", "FL": "12",
    "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18",
    "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23",
    "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28",
    "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
    "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38",
    "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
    "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55",
    "WY": "56",
}

# ---------------------------------------------------------------------------
# In-memory TTL cache
# ---------------------------------------------------------------------------

_cache: Dict[str, Tuple[object, float]] = {}


def _cache_get(key: str) -> Optional[object]:
    entry = _cache.get(key)
    if entry is None:
        return None
    data, ts = entry
    if time.monotonic() - ts > CACHE_TTL_SECONDS:
        del _cache[key]
        return None
    return data


def _cache_set(key: str, data: object) -> None:
    _cache[key] = (data, time.monotonic())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_float(val: object) -> Optional[float]:
    """Convert a Census API cell value to float, returning None for nulls."""
    if val is None:
        return None
    if val in _CENSUS_NULL_SENTINEL:
        return None
    try:
        f = float(val)
        if f in _CENSUS_NULL_SENTINEL:
            return None
        return f
    except (TypeError, ValueError):
        return None


def _derive_features(
    raw: Dict[str, Optional[float]],
    feature_names: List[str],
) -> Dict[str, Optional[float]]:
    """
    Given raw ACS variable values for one ZCTA, compute the derived
    feature values requested by the caller.
    """
    out: Dict[str, Optional[float]] = {}

    for fname in feature_names:
        if fname == "income":
            out[fname] = raw.get("B19013_001E")

        elif fname == "commute_time":
            agg = raw.get("B08136_001E")      # aggregate minutes
            n = raw.get("B08303_001E")        # total commuters
            if agg is not None and n and n > 0:
                out[fname] = agg / n          # mean minutes per commuter
            else:
                out[fname] = None

        elif fname == "pct_bachelors":
            total = raw.get("B15003_001E")
            if total and total > 0:
                higher_ed = sum(
                    raw.get(v) or 0.0
                    for v in ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"]
                )
                out[fname] = higher_ed / total
            else:
                out[fname] = None

        elif fname == "pct_households_children":
            total_hh = raw.get("B11005_001E")
            with_children = raw.get("B11005_002E")
            if total_hh and total_hh > 0 and with_children is not None:
                out[fname] = with_children / total_hh
            else:
                out[fname] = None

        elif fname == "racial_diversity_index":
            total = raw.get("B02001_001E")
            if total and total > 0:
                race_vars = ["B02001_002E", "B02001_003E", "B02001_004E",
                             "B02001_005E", "B02001_006E", "B02001_007E", "B02001_008E"]
                sum_sq = sum((raw.get(v) or 0.0) ** 2 for v in race_vars) / (total ** 2)
                out[fname] = 1.0 - sum_sq
            else:
                out[fname] = None

        else:
            out[fname] = None  # unsupported — caller validated earlier

    return out


# ---------------------------------------------------------------------------
# Core fetch function
# ---------------------------------------------------------------------------

async def fetch_acs_data(
    zctas: List[str],
    feature_names: List[str],
    state_fips: str,
    year: int,
    api_key: str,
) -> Dict[str, Dict[str, Optional[float]]]:
    """
    Fetch ACS 5-year data for a list of ZCTAs and return derived features.

    Parameters
    ----------
    zctas        : ZCTA codes to include; empty list means "all ZCTAs nationally"
    feature_names: Which derived features to compute
    state_fips   : 2-digit Census state FIPS (kept for signature compatibility)
    year         : ACS 5-year vintage (e.g. 2022)
    api_key      : Census API key (can be empty string for low-rate testing)

    Returns
    -------
    {zcta_code: {feature_name: value_or_None}}
    """
    # Collect every raw Census variable we need
    vars_needed: List[str] = []
    for fname in feature_names:
        for v in _FEATURE_VARS.get(fname, []):
            if v not in vars_needed:
                vars_needed.append(v)

    if not vars_needed:
        return {}

    var_str = ",".join(vars_needed)
    # Cache key is national (ZCTAs don't nest under states in the Census API)
    cache_key = f"acs|{year}|{var_str}"

    raw_rows = _cache_get(cache_key)

    if raw_rows is None:
        url = f"{CENSUS_BASE}/{year}/{ACS_DATASET}"
        params: Dict[str, str] = {
            "get": f"NAME,{var_str}",
            "for": "zip code tabulation area:*",
            # NOTE: ZCTAs are a national geography — Census API does not support
            # filtering by state with 'in=state:XX' for this geography level.
            # We filter to the requested ZCTAs client-side below.
        }
        if api_key:
            params["key"] = api_key

        last_exc: Exception = RuntimeError("Census fetch failed after retries.")
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            for attempt in range(3):
                try:
                    resp = await client.get(url, params=params)
                    resp.raise_for_status()
                    raw_rows = resp.json()
                    break
                except (httpx.HTTPError, Exception) as exc:
                    last_exc = exc
                    if attempt < 2:
                        await asyncio.sleep(1.5 ** attempt)  # 1s, 1.5s back-off
            else:
                raise last_exc

        _cache_set(cache_key, raw_rows)

    # Parse: first row is the header
    headers: List[str] = raw_rows[0]
    zcta_col = headers.index("zip code tabulation area")
    zcta_set = set(zctas) if zctas else None

    result: Dict[str, Dict[str, Optional[float]]] = {}

    for row in raw_rows[1:]:
        zcta_val: str = row[zcta_col]

        # Filter to requested ZCTAs when a list was given
        if zcta_set is not None and zcta_val not in zcta_set:
            continue

        raw_vals: Dict[str, Optional[float]] = {}
        for v in vars_needed:
            idx = headers.index(v)
            raw_vals[v] = _parse_float(row[idx])

        result[zcta_val] = _derive_features(raw_vals, feature_names)

    return result
