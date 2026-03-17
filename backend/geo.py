"""
City-to-ZIP and ZIP-to-coordinate resolver.

Strategy
--------
1. Primary  : Zippopotam.us free API — returns all ZIPs for a US city/state.
2. Secondary: Census Geocoder — resolves city name to lat/lng (not used for ZIPs
              directly, but useful for future ZCTA-centroid filtering).
3. Fallback : Return None; caller will fetch all state ZCTAs from ACS.

Zippopotam.us example:
    GET https://api.zippopotam.us/us/ca/irvine
    → {"post code": "92602", "places": [{"post code": "92602", ...}, ...]}
"""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional, Tuple

import httpx

ZIPPOPOTAM_BASE = "https://api.zippopotam.us/us"

# Permanent in-process cache for centroid lookups — Zippopotam data is static
_centroid_cache: Dict[str, Optional[Tuple[float, float]]] = {}


def _sanitise_city(city: str) -> str:
    """Lower-case and URL-safe: 'Los Angeles' → 'los%20angeles'."""
    return city.strip().lower().replace(" ", "%20")


async def lookup_zips_for_city(city: str, state: str) -> Optional[List[str]]:
    """
    Return a list of ZIP codes (strings) for the given US city/state, or
    None if the lookup fails (caller should fall back to all-state ZCTAs).
    """
    state_lower = state.strip().lower()
    city_encoded = _sanitise_city(city)
    url = f"{ZIPPOPOTAM_BASE}/{state_lower}/{city_encoded}"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                body = resp.json()
                # Response shape: {"places": [{"post code": "92602", ...}, ...]}
                places = body.get("places", [])
                zips = [p["post code"] for p in places if "post code" in p]
                return zips or None
            # 404 = city not found in database
    except (httpx.HTTPError, Exception):
        pass

    return None


async def lookup_zip_centroid(zip_code: str) -> Optional[Tuple[float, float]]:
    """
    Resolve a US ZIP code to a latitude/longitude pair using Zippopotam.us.
    Returns (lat, lng) or None if not available. Results are cached permanently.
    """
    key = zip_code.strip()
    if key in _centroid_cache:
        return _centroid_cache[key]

    url = f"{ZIPPOPOTAM_BASE}/{key}"
    result: Optional[Tuple[float, float]] = None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                body = resp.json()
                places = body.get("places", [])
                if places:
                    place0 = places[0]
                    lat_s = place0.get("latitude")
                    lng_s = place0.get("longitude")
                    if lat_s is not None and lng_s is not None:
                        result = (float(lat_s), float(lng_s))
    except (httpx.HTTPError, ValueError, TypeError, Exception):
        pass

    _centroid_cache[key] = result
    return result


async def lookup_zip_centroids(zip_codes: List[str]) -> Dict[str, Tuple[float, float]]:
    """
    Resolve many ZIP codes to centroids concurrently.
    Returns only ZIPs that could be resolved.
    """
    if not zip_codes:
        return {}

    tasks = [lookup_zip_centroid(z) for z in zip_codes]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    centroids: Dict[str, Tuple[float, float]] = {}
    for zip_code, result in zip(zip_codes, results):
        if isinstance(result, Exception) or result is None:
            continue
        centroids[zip_code] = result
    return centroids
