# HomeScore Backend

FastAPI service that ranks US ZIP codes using live Census ACS 5-year data and a
standardised weighted scoring equation. No database, no ML training — scores are
computed on-demand and cached in memory for 12 hours.

---

## Stack

| Layer     | Tech                         |
|-----------|------------------------------|
| Runtime   | Python 3.11+                 |
| Framework | FastAPI + uvicorn            |
| HTTP      | httpx (async)                |
| Validation| Pydantic v2                  |
| Data      | US Census ACS 5-year API     |

---

## Setup

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\activate       # Windows

pip install -r requirements.txt

# Copy the env template and add your Census API key
cp .env.example .env
# Edit .env: CENSUS_API_KEY=<your key>
# Free signup: https://api.census.gov/data/key_signup.html
```

---

## Run

```bash
# Development (auto-reload)
uvicorn main:app --reload --port 8000

# Or directly
python main.py
```

Interactive docs: http://localhost:8000/docs

---

## Supported ACS features

| `name`              | ACS variable(s)                              | Direction    |
|---------------------|----------------------------------------------|--------------|
| `income`            | B19013_001E (median household income)        | higher better|
| `median_rent`       | B25064_001E (median gross rent)              | lower better |
| `median_home_value` | B25077_001E (median home value)              | lower better |
| `commute_time`      | B08136_001E / B08303_001E (mean travel time) | lower better |
| `pct_bachelors`     | B15003_022–025E / B15003_001E (% bach+)      | higher better|

---

## Endpoints

### `GET /health`
Returns `{"status": "ok"}`.

---

### `POST /rank-zips`

Rank ZIPs by a weighted combination of ACS features.

**Request**
```json
{
  "city": "Irvine",
  "state": "CA",
  "acs_year": 2022,
  "features": [
    {"name": "income",       "weight": 0.4, "higher_is_better": true},
    {"name": "commute_time", "weight": 0.3, "higher_is_better": false},
    {"name": "median_rent",  "weight": 0.3, "higher_is_better": false}
  ],
  "zip_list": ["92617", "92612", "92618"]
}
```

`zip_list` is optional — omit it to auto-resolve ZIPs for the city.

**Response**
```json
{
  "city": "Irvine",
  "state": "CA",
  "year": 2022,
  "total_zips_scored": 3,
  "ranked_zips": [
    {
      "zip": "92617",
      "rank": 1,
      "score": 0.9241,
      "features": {
        "income": {
          "raw_value": 105000,
          "z_score": 1.12,
          "weight": 0.4,
          "contribution": 0.448
        },
        "commute_time": { ... },
        "median_rent":  { ... }
      }
    }
  ],
  "warnings": []
}
```

---

### `POST /rank-neighborhoods`

Same pipeline, response shaped to match the React frontend's `Neighborhood[]`:

```json
{
  "city": "Irvine",
  "state": "CA",
  "year": 2022,
  "total_zips_scored": 3,
  "neighborhoods": [
    {
      "id": "92617",
      "name": "ZIP 92617",
      "matchScore": 92.4,
      "tags": ["Top-ranked area", "Short commute"],
      "location": {"lat": 0.0, "lng": 0.0},
      "zip": "92617",
      "score": 0.9241,
      "features": { ... }
    }
  ],
  "warnings": []
}
```

> `location` is a placeholder centroid. Integrate a ZCTA centroid CSV or Google
> Geocoding API to populate real coordinates.

---

## Example curl commands

```bash
# Health check
curl http://localhost:8000/health

# Rank three Irvine ZIPs
curl -s -X POST http://localhost:8000/rank-zips \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Irvine",
    "state": "CA",
    "acs_year": 2022,
    "features": [
      {"name": "income",       "weight": 0.4, "higher_is_better": true},
      {"name": "commute_time", "weight": 0.3, "higher_is_better": false},
      {"name": "median_rent",  "weight": 0.3, "higher_is_better": false}
    ],
    "zip_list": ["92617", "92612", "92618", "92620", "92602", "92604", "92606"]
  }' | python3 -m json.tool

# Auto-resolve ZIPs from city name
curl -s -X POST http://localhost:8000/rank-neighborhoods \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Irvine",
    "state": "CA",
    "acs_year": 2022,
    "features": [
      {"name": "income",            "weight": 0.35, "higher_is_better": true},
      {"name": "commute_time",      "weight": 0.25, "higher_is_better": false},
      {"name": "median_rent",       "weight": 0.20, "higher_is_better": false},
      {"name": "pct_bachelors",     "weight": 0.20, "higher_is_better": true}
    ]
  }' | python3 -m json.tool
```

---

## Architecture notes

- **No database** — all state is ephemeral. ACS data is cached in-process with
  a 12-hour TTL (`census.py: _cache`).
- **Retry logic** — Census API calls retry up to 3× with exponential back-off.
- **Missing data** — ZCTA cells suppressed by Census (-666666666) are imputed to
  the city mean (z-score = 0) and flagged in `warnings`.
- **Weight normalisation** — weights need not sum exactly to 1; the server
  normalises them and notes it in `warnings`.
- **CORS** — enabled for `localhost:5173` (Vite), `localhost:3000`, and the
  GitHub Pages deployment.
