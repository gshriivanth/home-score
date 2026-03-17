"""
FBI Crime Data Explorer (CDE) async client.

Fetches ZIP-level violent and property crime rates.

Base URL: https://api.usa.gov/crime/fbi/cde
Endpoint: /summarized/zip/{zip_code}/offenses?from={year}&to={year}&API_KEY={key}

Response shape (per record):
    {"data_year": 2022, "offense": "violent-crime", "actual": 45, "population": 32000}

Derived features
----------------
violent_crime_rate   — violent crimes per 1,000 residents  (lower_is_better)
property_crime_rate  — property crimes per 1,000 residents (lower_is_better)
"""
from __future__ import annotations

import asyncio
import time
from typing import Dict, List, Optional, Tuple

import httpx

FBI_BASE = "https://api.usa.gov/crime/fbi/cde"
CACHE_TTL_SECONDS = 12 * 3600
_MAX_CONCURRENT = 20  # api.data.gov allows ~1000 req/hour per key; 20 concurrent is safe

SUPPORTED_FEATURES = {"violent_crime_rate", "property_crime_rate"}

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


def _rate_per_thousand(count: Optional[float], population: Optional[float]) -> Optional[float]:
    if count is None or not population:
        return None
    return round(count / population * 1000, 4)


async def _fetch_zip(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    zcta: str,
    api_key: str,
    year: int,
) -> Tuple[str, Dict[str, Optional[float]]]:
    """Fetch crime data for one ZIP and return (zcta, features)."""
    cache_key = f"fbi|{year}|{zcta}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return zcta, cached  # type: ignore[return-value]

    url = f"{FBI_BASE}/summarized/zip/{zcta}/offenses"
    params: Dict[str, object] = {"from": year, "to": year, "API_KEY": api_key}

    async with sem:
        try:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                result: Dict[str, Optional[float]] = {
                    "violent_crime_rate": None,
                    "property_crime_rate": None,
                }
                _cache_set(cache_key, result)
                return zcta, result
            body = resp.json()
        except (httpx.HTTPError, Exception):
            return zcta, {"violent_crime_rate": None, "property_crime_rate": None}

    # Records may be a top-level list or nested under "data"
    records: List[Dict] = body if isinstance(body, list) else body.get("data", [])

    violent_count: Optional[float] = None
    property_count: Optional[float] = None
    population: Optional[float] = None

    for record in records:
        pop = record.get("population")
        if pop and population is None:
            population = float(pop)

        offense = (record.get("offense") or "").lower()
        count = record.get("actual") or record.get("count")
        if count is None:
            continue
        count = float(count)

        if "violent" in offense:
            violent_count = count
        elif "property" in offense:
            property_count = count

    result = {
        "violent_crime_rate": _rate_per_thousand(violent_count, population),
        "property_crime_rate": _rate_per_thousand(property_count, population),
    }
    _cache_set(cache_key, result)
    return zcta, result


async def fetch_crime_data(
    zctas: List[str],
    api_key: str,
    year: int = 2022,
) -> Dict[str, Dict[str, Optional[float]]]:
    """
    Fetch FBI CDE crime statistics for a list of ZIP codes.

    Parameters
    ----------
    zctas   : ZIP code strings to fetch
    api_key : FBI CDE API key (required; returns None features when empty)
    year    : Reporting year (default 2022)

    Returns
    -------
    {zcta: {"violent_crime_rate": float|None, "property_crime_rate": float|None}}

    Missing values are left as None so scoring.py imputes them to the city mean (z=0).
    """
    empty = {"violent_crime_rate": None, "property_crime_rate": None}
    if not zctas or not api_key:
        return {z: dict(empty) for z in zctas}

    sem = asyncio.Semaphore(_MAX_CONCURRENT)
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        tasks = [_fetch_zip(client, sem, z, api_key, year) for z in zctas]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    out: Dict[str, Dict[str, Optional[float]]] = {}
    for r in results:
        if isinstance(r, Exception):
            continue
        zcta, features = r  # type: ignore[misc]
        out[zcta] = features
    return out
