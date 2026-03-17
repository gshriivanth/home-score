"""
NCES Education Data Portal async client (Urban Institute wrapper over NCES CCD/EdFacts).

Fetches school proficiency rates by ZIP code from the EdFacts assessments endpoint
and returns the average math + reading proficiency rate across all schools in the ZIP.

No API key required. National coverage (~27k ZIPs with data).

Base URL : https://educationdata.urban.org/api/v1
Endpoint : /schools/edfacts/assessments/{year}/grades/99/subjects/{subject}/
             ?zip_mailing={zip}&per_page=100

Derived features
----------------
avg_proficiency_rate — mean % of students proficient in math + reading across nearby
                       public schools (0–100, higher_is_better). Sourced from EdFacts
                       assessment data (most recent available year ≤ 2022).
"""
from __future__ import annotations

import asyncio
import time
from typing import Dict, List, Optional, Tuple

import httpx

NCES_BASE = "https://educationdata.urban.org/api/v1"
# EdFacts assessment years available; try most recent first and fall back
_ASSESSMENT_YEARS = [2022, 2021, 2019]
_SUBJECTS = ["mth", "rla"]  # math and reading/language arts
CACHE_TTL_SECONDS = 24 * 3600  # NCES data is static — cache for 24h
_MAX_CONCURRENT = 20  # Urban Institute API is permissive; 20 concurrent is safe

SUPPORTED_FEATURES = {"avg_proficiency_rate"}

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


async def _fetch_proficiency_for_zip(
    client: httpx.AsyncClient,
    zcta: str,
    year: int,
) -> Optional[float]:
    """
    Fetch avg math + reading proficiency for one ZIP from EdFacts.
    Both subjects are fetched in parallel. Returns a float 0–100, or None.
    """
    async def _fetch_subject(subject: str) -> List[float]:
        url = f"{NCES_BASE}/schools/edfacts/assessments/{year}/grades/99/subjects/{subject}/"
        params: Dict[str, object] = {"zip_mailing": zcta, "per_page": 100}
        try:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return []
            body = resp.json()
        except (httpx.HTTPError, Exception):
            return []
        pcts: List[float] = []
        for school in body.get("results", []):
            val = school.get("pct_prof_midpt")
            if val is not None:
                try:
                    f = float(val)
                    if 0.0 <= f <= 100.0:
                        pcts.append(f)
                except (TypeError, ValueError):
                    pass
        return pcts

    # Fetch math and reading in parallel
    subject_results = await asyncio.gather(*[_fetch_subject(s) for s in _SUBJECTS])
    all_pct: List[float] = [v for lst in subject_results for v in lst]

    if not all_pct:
        return None
    return round(sum(all_pct) / len(all_pct), 2)


async def _fetch_zip(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    zcta: str,
) -> Tuple[str, Dict[str, Optional[float]]]:
    """Fetch school proficiency for one ZIP and return (zcta, features)."""
    cache_key = f"nces|{zcta}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return zcta, cached  # type: ignore[return-value]

    async with sem:
        # Try years from most recent to oldest; stop on first year with data
        avg_pct: Optional[float] = None
        for year in _ASSESSMENT_YEARS:
            avg_pct = await _fetch_proficiency_for_zip(client, zcta, year)
            if avg_pct is not None:
                break

    result: Dict[str, Optional[float]] = {"avg_proficiency_rate": avg_pct}
    _cache_set(cache_key, result)
    return zcta, result


async def fetch_school_data(
    zctas: List[str],
    api_key: str = "",  # unused — NCES requires no key; kept for interface compatibility
) -> Dict[str, Dict[str, Optional[float]]]:
    """
    Fetch NCES EdFacts proficiency rates for a list of ZIP codes.

    Parameters
    ----------
    zctas   : ZIP code strings to fetch
    api_key : ignored (NCES Education Data Portal is keyless)

    Returns
    -------
    {zcta: {"avg_proficiency_rate": float|None}}

    Value is the mean % of students proficient in math + reading (0–100) across
    all public schools in the ZIP. None when no EdFacts data exists for that ZIP;
    scoring.py imputes those to the city mean (z=0).
    """
    if not zctas:
        return {}

    sem = asyncio.Semaphore(_MAX_CONCURRENT)
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
        tasks = [_fetch_zip(client, sem, z) for z in zctas]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    out: Dict[str, Dict[str, Optional[float]]] = {}
    for r in results:
        if isinstance(r, Exception):
            continue
        zcta, features = r  # type: ignore[misc]
        out[zcta] = features
    return out
