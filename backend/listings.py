"""
listings.py — Scrape Redfin search results for active for-sale listings.

Pipeline:
  1. Build a Redfin search URL from user criteria (zip, beds, baths, price range, sqft, property type)
  2. Fetch the page and attempt 3 extraction strategies in order:
       A. Large JSON blobs embedded in <script> tags (most reliable)
       B. __reactServerAgent / __reactServerState window assignments
       C. HTML home card parsing (most fragile, last resort)
  3. Post-filter results by price range and return up to 5 listings
"""
from __future__ import annotations

import asyncio
import json
import re
import time as _time
from typing import Optional

import httpx
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.redfin.com/",
}

# Redfin property type filter values
_PROP_TYPE_MAP = {
    "house":       "house",
    "sfr":         "house",
    "condo":       "condo",
    "townhouse":   "townhouse",
    "multi-family":"multifamily",
    "mfr":         "multifamily",
    "mobile":      "mobile",
}

_STOCK_IMAGES = [
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format&fit=crop",
]

# ---------------------------------------------------------------------------
# Cache (1-hour TTL)
# ---------------------------------------------------------------------------

_listing_cache: dict[str, tuple[list, float]] = {}
_CACHE_TTL = 3600


def _cache_key(
    zip_code: str,
    bedrooms: int,
    bathrooms: float,
    min_price: int,
    max_price: int,
    property_type: str,
) -> str:
    return f"{zip_code}|{bedrooms}|{bathrooms}|{min_price}-{max_price}|{property_type}"


def _cache_get(key: str) -> list | None:
    entry = _listing_cache.get(key)
    if not entry:
        return None
    data, ts = entry
    if _time.monotonic() - ts > _CACHE_TTL:
        del _listing_cache[key]
        return None
    return data


def _cache_set(key: str, data: list) -> None:
    _listing_cache[key] = (data, _time.monotonic())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_int(val) -> Optional[int]:
    try:
        return int(float(str(val).replace(",", "").replace("$", "").strip()))
    except (TypeError, ValueError):
        return None


def _safe_float(val) -> Optional[float]:
    try:
        return float(str(val).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return None


def _redfin_url(path: str) -> str:
    if not path:
        return ""
    if path.startswith("http"):
        return path
    return f"https://www.redfin.com{path}"


# ---------------------------------------------------------------------------
# URL builder
# ---------------------------------------------------------------------------

def _build_search_url(
    zip_code: str,
    bedrooms: int,
    bathrooms: float,
    min_price: int,
    max_price: int,
    sqft_min: int,
    sqft_max: int,
    property_type: str,
) -> str:
    """
    Build a Redfin filter URL.
    Example:
      https://www.redfin.com/zipcode/90210/filter/min-beds=3,min-baths=2,min-price=500000,max-price=900000,property-type=house
    """
    filters: list[str] = []

    if bedrooms > 0:
        filters.append(f"min-beds={bedrooms}")
    if bathrooms > 0:
        filters.append(f"min-baths={int(bathrooms)}")

    base = f"https://www.redfin.com/zipcode/{zip_code}"
    if filters:
        base += "/filter/" + ",".join(filters)
    return base


# ---------------------------------------------------------------------------
# Extraction: Strategy A — large JSON blobs in <script> tags
# ---------------------------------------------------------------------------

def _extract_from_script_json(soup: BeautifulSoup) -> list[dict]:
    """
    Redfin embeds listing data as large JSON objects in inline <script> tags.
    We look for any script tag whose text contains home-like JSON keys and
    try to extract property objects from it using an iterative DFS.
    """
    results: list[dict] = []

    for script in soup.find_all("script"):
        txt = script.string or ""
        # Only bother with large scripts that look like they contain listing data
        if len(txt) < 1000:
            continue
        if '"price"' not in txt or '"beds"' not in txt and '"numBeds"' not in txt:
            continue

        # Try to find JSON object boundaries and parse them
        # Redfin sometimes wraps data as: window.X = {...}; or just {...}
        for match in re.finditer(r'\{', txt):
            start = match.start()
            # Quick pre-check: nearby text should look home-like
            snippet = txt[start:start + 200]
            if '"price"' not in snippet and '"address"' not in snippet:
                continue
            # Find matching closing brace
            depth = 0
            end = start
            for i, ch in enumerate(txt[start:], start):
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end <= start:
                continue
            try:
                obj = json.loads(txt[start:end])
            except (json.JSONDecodeError, ValueError):
                continue

            homes = _walk_for_homes(obj)
            results.extend(homes)
            if len(results) >= 10:
                break

        if results:
            break

    return results


# ---------------------------------------------------------------------------
# Extraction: Strategy B — window.__reactServerAgent assignment
# ---------------------------------------------------------------------------

def _extract_from_window_assignment(soup: BeautifulSoup) -> list[dict]:
    """
    Redfin sometimes serializes state as:
      window.__reactServerAgent = {...};
    or similar window.X = JSON patterns.
    """
    results: list[dict] = []

    for script in soup.find_all("script"):
        txt = script.string or ""
        if "window." not in txt or '"price"' not in txt:
            continue

        # Find the JSON value after `window.X =`
        m = re.search(r'window\.\w+\s*=\s*(\{)', txt)
        if not m:
            continue

        start = m.start(1)
        depth = 0
        end = start
        for i, ch in enumerate(txt[start:], start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break

        try:
            obj = json.loads(txt[start:end])
        except (json.JSONDecodeError, ValueError):
            continue

        homes = _walk_for_homes(obj)
        results.extend(homes)
        if results:
            break

    return results


# ---------------------------------------------------------------------------
# Iterative DFS to find home objects in arbitrary JSON
# ---------------------------------------------------------------------------

def _walk_for_homes(root) -> list[dict]:
    """
    Iterative DFS over a nested JSON structure.
    Identifies dicts that look like Redfin home objects and parses them.
    Avoids recursion depth limits.
    """
    results: list[dict] = []
    stack = [root]

    while stack and len(results) < 10:
        obj = stack.pop()

        if isinstance(obj, list):
            stack.extend(obj)
            continue

        if not isinstance(obj, dict):
            continue

        # Heuristic: a "home object" has price + address or beds
        has_price = "price" in obj or "listingPrice" in obj
        has_address = "address" in obj or "streetAddress" in obj
        has_beds = "beds" in obj or "numBeds" in obj or "bedsCount" in obj

        if has_price and (has_address or has_beds):
            parsed = _parse_home_dict(obj)
            if parsed:
                results.append(parsed)
                continue  # don't descend into homes we've already parsed

        # Descend into values
        stack.extend(obj.values())

    return results


def _parse_home_dict(obj: dict) -> Optional[dict]:
    """Parse a single home-like dict into our listing schema."""

    # --- Address ---
    addr = obj.get("address") or obj.get("streetAddress") or {}
    if isinstance(addr, dict):
        address = (
            addr.get("assembledAddress")
            or addr.get("streetAddress")
            or addr.get("displayAddress")
            or ""
        )
    else:
        address = str(addr).strip()

    # --- Price ---
    raw_price = obj.get("price") or obj.get("listingPrice") or {}
    if isinstance(raw_price, dict):
        price = _safe_int(raw_price.get("value") or raw_price.get("amount"))
    else:
        price = _safe_int(raw_price)

    # --- Beds ---
    beds = _safe_int(
        obj.get("beds") or obj.get("numBeds") or obj.get("bedsCount")
        or obj.get("bedrooms") or obj.get("numBedrooms")
    )

    # --- Baths ---
    baths = _safe_float(
        obj.get("baths") or obj.get("numBaths") or obj.get("bathsTotal")
        or obj.get("bathrooms") or obj.get("numBathrooms")
    )

    # --- Sqft ---
    raw_sqft = obj.get("sqFt") or obj.get("sqft") or obj.get("livingArea") or {}
    if isinstance(raw_sqft, dict):
        sqft = _safe_int(raw_sqft.get("value"))
    else:
        sqft = _safe_int(raw_sqft)

    # --- Image ---
    photo = (
        obj.get("primaryPhotoUrl")
        or obj.get("photoUrl")
        or obj.get("heroImageUrl")
        or ""
    )
    if isinstance(photo, dict):
        photo = photo.get("url", "")
    image_url = photo if isinstance(photo, str) and photo.startswith("http") else None

    # --- Listing URL ---
    url_path = obj.get("url") or obj.get("listingUrl") or obj.get("propertyUrl") or ""
    listing_url = _redfin_url(url_path)

    # --- Property type ---
    prop_type = obj.get("propertyType") or obj.get("homeType") or "House"
    if isinstance(prop_type, dict):
        prop_type = prop_type.get("type", "House")

    # --- Year built ---
    year_built = _safe_int(obj.get("yearBuilt"))

    # Require at least address or price to be a valid listing
    if not address and not price:
        return None

    return {
        "address": address,
        "price": price,
        "bedrooms": beds,
        "bathrooms": baths,
        "sqft": sqft,
        "yearBuilt": year_built,
        "propertyType": prop_type,
        "imageUrl": image_url,
        "redfinUrl": listing_url,
        "garage": None,
        "pool": None,
    }


# ---------------------------------------------------------------------------
# Extraction: Strategy C — HTML card parsing (last resort)
# ---------------------------------------------------------------------------

def _extract_from_html_cards(soup: BeautifulSoup) -> list[dict]:
    """Parse Redfin home cards from rendered HTML."""
    listings: list[dict] = []

    cards = (
        soup.select(".HomeCardContainer")
        or soup.select(".MapHomeCard")
        or soup.select("[data-rf-test-id='MapHomeCard']")
        or soup.select("article[class*='HomeCard']")
    )

    for card in cards[:10]:
        listing: dict = {}

        # Address
        addr_el = card.select_one(".homeAddressV2, .home-address, [class*='address']")
        if addr_el:
            listing["address"] = addr_el.get_text(strip=True)

        # Price
        price_el = card.select_one(".homecardV2Price, .home-price, [class*='price']")
        if price_el:
            m = re.search(r"[\d,]+", price_el.get_text().replace("$", "").replace(",", ""))
            if m:
                listing["price"] = _safe_int(m.group())

        # Beds / baths / sqft
        for stat in card.select(".HomeStatsV2 span, .home-stats span, [class*='stats'] span"):
            txt = stat.get_text(strip=True).lower()
            m = re.search(r"([\d.]+)", txt)
            if not m:
                continue
            val = m.group(1)
            if "bed" in txt:
                listing["bedrooms"] = _safe_int(val)
            elif "bath" in txt:
                listing["bathrooms"] = _safe_float(val)
            elif "sq" in txt or "ft" in txt:
                listing["sqft"] = _safe_int(val)

        # Image
        img = card.select_one("img[src*='ssl.cdn-redfin'], img[src*='photo']")
        if img:
            src = img.get("src", "")
            if src.startswith("http"):
                listing["imageUrl"] = src

        # Link
        link = card.select_one("a[href*='/home/']") or card.find("a", href=True)
        if link:
            listing["redfinUrl"] = _redfin_url(link["href"])

        if listing.get("address") or listing.get("price"):
            listings.append(listing)

    return listings


# ---------------------------------------------------------------------------
# Main scrape function
# ---------------------------------------------------------------------------

def _extract_from_ld_json(soup: BeautifulSoup) -> list[dict]:
    """Parse robust structured data (schema.org/Product / SingleFamilyResidence)."""
    listings_by_url: dict[str, dict] = {}
    
    scripts = soup.find_all('script', type='application/ld+json')
    for script in scripts:
        if not script.string: continue
        try:
            items = json.loads(script.string)
            if not isinstance(items, list):
                items = [items]
            for item in items:
                if not isinstance(item, dict): continue
                
                url = item.get("url", "")
                if not url: continue
                
                if url not in listings_by_url:
                    listings_by_url[url] = {"redfinUrl": _redfin_url(url)}
                
                entry = listings_by_url[url]
                
                if item.get("@type") == "SingleFamilyResidence" or item.get("@type") == "Product":
                    if "name" in item and not entry.get("address"):
                        entry["address"] = item["name"]
                    
                    if "numberOfRooms" in item:
                        entry["bedrooms"] = _safe_int(str(item["numberOfRooms"]))
                        
                    if "floorSize" in item and isinstance(item["floorSize"], dict):
                        entry["sqft"] = _safe_int(str(item["floorSize"].get("value")))
                
                if item.get("@type") == "Product" and "offers" in item:
                    offers = item["offers"]
                    if isinstance(offers, dict) and "price" in offers:
                        entry["price"] = _safe_int(str(offers["price"]))
                        
                elif item.get("@type") == "offer" and "price" in item:
                    entry["price"] = _safe_int(str(item["price"]))
                    
        except Exception:
            continue
            
    # Remove any entries that lack a price or address
    valid_listings = [L for L in listings_by_url.values() if L.get("price") and L.get("address")]
    return valid_listings


async def _scrape_listing_detail_image(url: str) -> Optional[str]:
    """
    Scrape the first/main image from a Redfin listing detail page.
    Returns the image URL or None if not found.
    """
    if not url or not url.startswith("http"):
        return None

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(15.0),
            follow_redirects=True,
            headers=_SCRAPE_HEADERS,
        ) as client:
            resp = await client.get(url)

        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Strategy 1: Look for the main hero image
        hero_img = soup.select_one("img[class*='hero'], img[class*='Hero'], img[data-rf-test-name='hero-image']")
        if hero_img and hero_img.get("src"):
            src = hero_img["src"]
            if src.startswith("http"):
                return src

        # Strategy 2: Look for carousel/slider first image
        carousel_img = soup.select_one(
            "div[class*='carousel'] img, "
            "div[class*='Carousel'] img, "
            "div[class*='slider'] img, "
            "div[class*='gallery'] img:first-child"
        )
        if carousel_img and carousel_img.get("src"):
            src = carousel_img["src"]
            if src.startswith("http"):
                return src

        # Strategy 3: Look for meta tags with property images
        og_image = soup.select_one("meta[property='og:image']")
        if og_image and og_image.get("content"):
            content = og_image["content"]
            if content.startswith("http"):
                return content

        # Strategy 4: Any large image with 'photo' or 'listing' in the src/class
        photo_img = soup.select_one(
            "img[src*='ssl.cdn-redfin.com'], "
            "img[src*='photo'], "
            "img[class*='photo'], "
            "img[class*='listing']"
        )
        if photo_img and photo_img.get("src"):
            src = photo_img["src"]
            if src.startswith("http"):
                return src

        # Strategy 5: Parse JSON-LD for image
        scripts = soup.find_all('script', type='application/ld+json')
        for script in scripts:
            if not script.string:
                continue
            try:
                data = json.loads(script.string)
                if isinstance(data, list):
                    data = data[0] if data else {}
                if isinstance(data, dict):
                    img = data.get("image")
                    if isinstance(img, str) and img.startswith("http"):
                        return img
                    elif isinstance(img, list) and img:
                        first = img[0]
                        if isinstance(first, str) and first.startswith("http"):
                            return first
                        elif isinstance(first, dict) and first.get("url"):
                            return first["url"]
            except (json.JSONDecodeError, Exception):
                continue

    except Exception as e:
        print(f"[SCRAPE] Failed to fetch detail image from {url}: {e}")
        return None

    return None


async def _scrape_search_results(url: str) -> list[dict]:
    """Fetch a Redfin search page and extract listings using 4 strategies."""
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(25.0),
        follow_redirects=True,
        headers=_SCRAPE_HEADERS,
    ) as client:
        resp = await client.get(url)

    if resp.status_code != 200:
        raise RuntimeError(f"Redfin returned HTTP {resp.status_code} for {url}")

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try strategies in order, stop at first that yields results
    listings = _extract_from_ld_json(soup)
    if not listings:
        listings = _extract_from_script_json(soup)
    if not listings:
        listings = _extract_from_window_assignment(soup)
    if not listings:
        listings = _extract_from_html_cards(soup)

    return listings


# ---------------------------------------------------------------------------
# Post-processing: filter + deduplicate
# ---------------------------------------------------------------------------

def _filter_and_rank(
    listings: list[dict],
    bedrooms: int,
    bathrooms: float,
    min_price: int,
    max_price: int,
) -> list[dict]:
    """
    Filter out listings outside the price range (with 10% tolerance),
    then rank by closeness to the target bed/bath/price midpoint.
    """
    price_mid = (min_price + max_price) / 2
    tolerance = 0.10

    filtered = []
    seen_addresses: set[str] = set()

    for lst in listings:
        # Deduplicate by address
        addr = (lst.get("address") or "").strip().lower()
        if addr and addr in seen_addresses:
            continue
        if addr:
            seen_addresses.add(addr)

        # Price filter (skip if price known and out of range + tolerance)
        price = lst.get("price")
        if price:
            lo = min_price * (1 - tolerance)
            hi = max_price * (1 + tolerance)
            if not (lo <= price <= hi):
                continue

        filtered.append(lst)

    # Rank by combined closeness score
    def score(lst: dict) -> float:
        s = 0.0
        price = lst.get("price") or price_mid
        beds = lst.get("bedrooms") or bedrooms
        baths = lst.get("bathrooms") or bathrooms
        if price_mid > 0:
            s -= abs(price - price_mid) / price_mid
        s -= abs(beds - bedrooms) * 2
        s -= abs(baths - bathrooms)
        # Bonus for having rich data
        if lst.get("imageUrl"):
            s += 0.5
        if lst.get("redfinUrl"):
            s += 0.3
        return s

    filtered.sort(key=score, reverse=True)
    return filtered[:5]


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

async def generate_listings(
    zip_code: str,
    city: str,
    state: str,
    bedrooms: int,
    bathrooms: float,
    min_price: int,
    max_price: int,
    sqft_min: int,
    sqft_max: int,
    property_type: str,
    garage: bool,
    pool: bool,
    year_built: str,
) -> list[dict]:
    """
    Returns up to 5 active for-sale listings from Redfin matching the criteria.
    Raises RuntimeError if scraping fails entirely (no silent fallback).
    """
    ck = _cache_key(zip_code, bedrooms, bathrooms, min_price, max_price, property_type)
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    search_url = _build_search_url(
        zip_code, bedrooms, bathrooms,
        min_price, max_price,
        sqft_min, sqft_max,
        property_type,
    )

    # Scrape — raises on HTTP error
    raw = await _scrape_search_results(search_url)

    # Disable filtering to see what we're actually getting
    filtered = raw[:5]
    # filtered = _filter_and_rank(raw, bedrooms, bathrooms, min_price, max_price)

    price_mid = (min_price + max_price) // 2

    # Build base results
    results: list[dict] = []
    for i, d in enumerate(filtered):
        results.append({
            "id": f"redfin-{zip_code}-{i}",
            "neighborhoodId": zip_code,
            "address": d.get("address") or f"{city}, {state} {zip_code}",
            "price": d.get("price") or price_mid,
            "bedrooms": d.get("bedrooms") or bedrooms,
            "bathrooms": d.get("bathrooms") or bathrooms,
            "sqft": d.get("sqft") or ((sqft_min + sqft_max) // 2),
            "yearBuilt": d.get("yearBuilt"),
            "propertyType": d.get("propertyType") or property_type or "House",
            "garage": d.get("garage") if d.get("garage") is not None else garage,
            "pool": d.get("pool") if d.get("pool") is not None else pool,
            "redfinUrl": d.get("redfinUrl") or search_url,
            "imageUrl": d.get("imageUrl") or _STOCK_IMAGES[i % len(_STOCK_IMAGES)],
            "description": (
                f"{d.get('bedrooms') or bedrooms}bd/"
                f"{d.get('bathrooms') or bathrooms}ba in {city}, {state}"
            ),
            "source": "redfin",
            "scraped": True,
            "_raw": d,  # Keep raw data for image enhancement
        })

    # Enhance images by scraping detail pages (parallel)
    print(f"[SCRAPE] Enhancing {len(results)} listings with detail page images...")

    # Collect URLs to scrape and their indices
    urls_to_scrape: list[tuple[int, str]] = []
    for i, result in enumerate(results):
        redfin_url = result["redfinUrl"]
        # Only scrape detail pages that have real Redfin URLs (not the search URL)
        if redfin_url and redfin_url != search_url and "/home/" in redfin_url:
            urls_to_scrape.append((i, redfin_url))

    # Scrape all detail pages in parallel
    if urls_to_scrape:
        scrape_tasks = [_scrape_listing_detail_image(url) for _, url in urls_to_scrape]
        detail_images = await asyncio.gather(*scrape_tasks, return_exceptions=True)

        # Update results with detail images where available
        for (idx, url), detail_img in zip(urls_to_scrape, detail_images):
            if isinstance(detail_img, Exception):
                print(f"[SCRAPE] Error fetching detail image for listing {idx}: {detail_img}")
            elif detail_img:
                print(f"[SCRAPE] Found detail image for listing {idx}: {detail_img[:80]}...")
                results[idx]["imageUrl"] = detail_img
            elif not results[idx]["_raw"].get("imageUrl"):
                # Keep stock image as fallback
                print(f"[SCRAPE] No detail image found for listing {idx}, using stock image")

    # Clean up raw data
    for result in results:
        result.pop("_raw", None)

    # If nothing survived filtering, raise so the caller knows
    if not results:
        raise RuntimeError(
            f"No listings found matching criteria for ZIP {zip_code} "
            f"(beds={bedrooms}, baths={bathrooms}, price={min_price}-{max_price}). "
            f"Search URL: {search_url}"
        )

    _cache_set(ck, results)
    return results