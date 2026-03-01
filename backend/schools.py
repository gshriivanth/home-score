"""
GreatSchools API async client.

Fetches school ratings by ZIP code and returns the average rating across all
nearby schools (elementary, middle, and high school combined).

Base URL: https://api.greatschools.org
Endpoint: /schools/nearby?zip={zip}&key={key}&limit=20&levelCode=e,m,h

Response shape: list of school objects, each containing a "rating" field (1–10 scale).

Derived features
----------------
avg_school_rating — mean GreatSchools rating (1–10) across nearby schools (higher_is_better)
"""
from __future__ import annotations

import asyncio
import time
from typing import Dict, List, Optional, Tuple

import httpx

GREATSCHOOLS_BASE = "https://api.greatschools.org"
CACHE_TTL_SECONDS = 12 * 3600
_MAX_CONCURRENT = 5  # stay within GreatSchools rate limits

SUPPORTED_FEATURES = {"avg_school_rating"}

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


async def _fetch_zip(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    zcta: str,
    api_key: str,
) -> Tuple[str, Dict[str, Optional[float]]]:
    """Fetch school data for one ZIP and return (zcta, features)."""
    cache_key = f"schools|{zcta}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return zcta, cached  # type: ignore[return-value]

    url = f"{GREATSCHOOLS_BASE}/schools/nearby"
    params: Dict[str, object] = {
        "zip": zcta,
        "key": api_key,
        "limit": 20,
        "levelCode": "e,m,h",  # elementary, middle, high
    }

    async with sem:
        try:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                result: Dict[str, Optional[float]] = {"avg_school_rating": None}
                _cache_set(cache_key, result)
                return zcta, result
            body = resp.json()
        except (httpx.HTTPError, Exception):
            return zcta, {"avg_school_rating": None}

    # Response may be a top-level list or nested under "schools"
    schools: List[Dict] = body if isinstance(body, list) else body.get("schools", [])

    ratings = [
        float(s["rating"])
        for s in schools
        if s.get("rating") is not None
    ]
    avg_rating = round(sum(ratings) / len(ratings), 4) if ratings else None

    result = {"avg_school_rating": avg_rating}
    _cache_set(cache_key, result)
    return zcta, result


async def fetch_school_data(
    zctas: List[str],
    api_key: str,
) -> Dict[str, Dict[str, Optional[float]]]:
    """
    Fetch GreatSchools ratings for a list of ZIP codes.

    Parameters
    ----------
    zctas   : ZIP code strings to fetch
    api_key : GreatSchools API key (required; returns None features when empty)

    Returns
    -------
    {zcta: {"avg_school_rating": float|None}}

    Rating is the mean GreatSchools score (1–10) across all nearby schools.
    Missing values are left as None so scoring.py imputes them to the city mean (z=0).
    """
    if not zctas or not api_key:
        return {z: {"avg_school_rating": None} for z in zctas}

    sem = asyncio.Semaphore(_MAX_CONCURRENT)
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        tasks = [_fetch_zip(client, sem, z, api_key) for z in zctas]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    out: Dict[str, Dict[str, Optional[float]]] = {}
    for r in results:
        if isinstance(r, Exception):
            continue
        zcta, features = r  # type: ignore[misc]
        out[zcta] = features
    return out
