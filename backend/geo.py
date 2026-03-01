"""
City-to-ZIP resolver.

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

import re
from typing import List, Optional

import httpx

ZIPPOPOTAM_BASE = "https://api.zippopotam.us/us"


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
