# HomeScore

**HomeScore** is an AI-powered, end-to-end home selection platform. Starting from a city search, it guides users through a personalized, data-driven pipeline — neighborhood ranking, live listing browsing, and a 36-month property appreciation forecast — finishing with an LLM-generated narrative summary of their ideal home.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Pipeline Stages](#pipeline-stages)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Sources](#data-sources)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Running the Backend](#running-the-backend)
  - [Running the Frontend](#running-the-frontend)
- [ML Models](#ml-models)
- [Configuration](#configuration)

---

## Overview

Finding a home involves dozens of competing factors — commute time, school quality, crime rates, neighborhood income, future appreciation. HomeScore unifies these signals into a single, explainable score and walks users through a structured decision funnel:

1. **City selection** — autocomplete-powered city search with OpenStreetMap geocoding
2. **Priority ranking** — users rank 8 neighborhood categories by personal importance
3. **Home requirements** — bedrooms, bathrooms, property type, budget, sqft, lot size, garage/pool, year built
4. **Neighborhood ranking** — ZCTAs scored against national reference data, displayed on an interactive Leaflet map
5. **Live listings** — Redfin-scraped listings filtered to match user requirements
6. **Cost & appreciation summary** — 6/12/36-month XGBoost forecasts + Gemini-generated narrative

The system is **fully stateless** — no database. All session state is ephemeral, neighborhood feature vectors are static files loaded at startup, and listings are fetched live per request.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (React SPA)                │
│  CityInput → PriorityRanking → PreferenceIntake         │
│  → NeighborhoodRankings → HouseListings → CostSummary   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (REST)
┌──────────────────────▼──────────────────────────────────┐
│                   FastAPI Backend                        │
│                                                         │
│  /rank-neighborhoods   →  census.py + fbi.py +          │
│                           schools.py + scoring.py       │
│  /listings             →  listings.py (Redfin scraper)  │
│  /predict-appreciation →  appreciation.py (XGBoost)     │
│  /generate-summary     →  Gemini 2.5 Flash              │
└──────┬──────────┬──────────┬──────────┬─────────────────┘
       │          │          │          │
  Census ACS   FBI CDE   NCES / GS   FRED API
  (httpx)      (httpx)   (httpx)     (httpx)
```

**Key design decisions:**

- **No database** — all state is in-memory or fetched on demand. Removes ops overhead for a hackathon context while keeping the architecture easy to reason about.
- **National scope** — scoring normalizes against all US ZCTAs, not a single metro area.
- **Hard vs. soft filters** — in the listings stage, hard filters exclude listings; soft filters badge them but never remove them.
- **LLM budget** — Gemini is called at most once per pipeline run (summary endpoint only).

---

## Pipeline Stages

### Stage 1 — Preference Intake
Collects city + state, user-weighted neighborhood priorities (8 categories → feature weights normalized to sum to 1.0), and house-level requirements (beds, baths, type, budget, sqft, lot, amenities, year built).

### Stage 2 — Neighborhood Ranking
- Resolves city → ZIPs via [Zippopotam.us](http://www.zippopotam.us/); falls back to all state ZCTAs if the city is not found.
- Fetches ACS 5-year estimates, FBI crime rates, and school ratings concurrently (12-hour in-memory cache).
- Normalizes each feature with national z-scores so scores are comparable across any US city.
- Flips directionality for inverse features (e.g., lower crime → higher score).
- Returns ranked ZCTAs with per-feature contributions, tags, and centroid coordinates for map display.

### Stage 3 — House Filtering
Deterministic rule engine (not ML). Hard filters on beds/baths/type/budget/sqft; soft filters on lot size, garage, pool, year built. Returns up to 6 listings from Redfin with a refresh mechanism that cycles through the full matched set.

### Stage 4 — Appreciation & Summary
- XGBoost model produces best/avg/worst appreciation projections at 6, 12, and 36 months.
- FRED macro indicators (mortgage rate, fed funds rate, unemployment, CPI) are woven into the feature vector alongside listing-level fields.
- Gemini 2.5 Flash generates a 3-paragraph narrative using structured data from all prior stages.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + Vite 7 + TypeScript 5.9 |
| UI components | Tailwind CSS 4 + shadcn/ui (Radix UI primitives) |
| Charts | Recharts 3 |
| Map | Leaflet + react-leaflet 5 |
| Routing | React Router 7 |
| Backend framework | FastAPI + Uvicorn |
| HTTP client | httpx (async) |
| Data validation | Pydantic v2 |
| ML — neighborhood scoring | scikit-learn (z-score normalization, weighted ranking) |
| ML — appreciation forecast | XGBoost (3 regression models × 3 horizons) |
| Model serialization | joblib |
| LLM | Google Gemini 2.5 Flash (`google-genai` SDK) |
| External APIs | Census ACS 5-year, FBI CDE, NCES, FRED, Zippopotam.us, Nominatim |
| Testing | pytest + pytest-asyncio |

---

## Project Structure

```
home-score/
├── backend/
│   ├── main.py              # FastAPI app, CORS, startup, route registration
│   ├── models.py            # Pydantic request/response schemas
│   ├── scoring.py           # Z-score normalization, directional weighting, ranking
│   ├── census.py            # Census ACS 5-year API client + TTL cache
│   ├── fbi.py               # FBI Crime Data Explorer client + TTL cache
│   ├── schools.py           # School rating client (NCES) + TTL cache
│   ├── geo.py               # ZIP resolution via Zippopotam.us + centroid lookup
│   ├── listings.py          # Redfin scraper (JSON blob + HTML fallback)
│   ├── appreciation.py      # XGBoost appreciation model + FRED macro fetcher
│   └── venv/                # Python virtual environment (not committed)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── routes.ts         # Route definitions
│   │   │   ├── api/index.ts      # Typed API client (BASE_URL from VITE_API_URL)
│   │   │   ├── context/          # PreferencesContext — global session state
│   │   │   ├── pages/            # CityInput, PriorityRanking, PreferenceIntake,
│   │   │   │                     # NeighborhoodRankings, HouseListings, CostSummary
│   │   │   └── data/mockData.ts  # Fallback neighborhoods + listings for offline dev
│   │   ├── main.tsx
│   │   └── styles/
│   ├── package.json
│   └── vite.config.ts
├── models/
│   ├── appreciation_xgb.joblib   # Serialized XGBoost model
│   ├── preprocess_meta.json      # Feature names + scaler parameters
│   └── README.md                 # Model card
├── docs/
│   └── HomeScore_PRD_v2.pdf
├── requirements.txt         # Backend Python dependencies
├── test_zips.py             # Async ZIP lookup smoke test
└── index.html               # GitHub Pages placeholder
```

---

## Data Sources

| Source | What it provides | Notes |
|---|---|---|
| [Census ACS 5-year](https://www.census.gov/data/developers/data-sets/acs-5year.html) | Median income, median rent, home value, commute time, education attainment, household composition, racial diversity index | Requires `CENSUS_API_KEY` |
| [FBI Crime Data Explorer](https://cde.ucr.cjis.gov/) | Violent crime rate, property crime rate (per 1,000 residents) | Requires `FBI_API_KEY`; optional — omitted from score if key missing |
| [NCES](https://nces.ed.gov/) | Average school rating for nearby schools | Optional — omitted from score if key missing |
| [FRED](https://fred.stlouisfed.org/docs/api/fred/) | Mortgage rate, fed funds rate, unemployment, CPI for appreciation model | Requires `FRED_API_KEY` |
| [Redfin](https://www.redfin.com/) | Live property listings with price, beds, baths, sqft, photos | Scraped — no API key required |
| [Zippopotam.us](http://www.zippopotam.us/) | City → ZIP code resolution | Free, no key required |
| [Nominatim / OpenStreetMap](https://nominatim.org/) | City autocomplete + lat/lng geocoding in frontend | Free, no key required |
| [Google Gemini](https://ai.google.dev/) | LLM narrative summary | Requires `GEMINI_API_KEY` |

---

## API Reference

All endpoints are served at `http://localhost:8000` by default.

### `GET /health`
```json
{ "status": "ok" }
```

### `POST /rank-neighborhoods`
Ranks ZCTAs for a city and returns data shaped for the frontend map and list view.

**Request body:**
```json
{
  "city": "Austin",
  "state": "TX",
  "features": ["income", "commute_time", "violent_crime_rate"],
  "weights": { "income": 0.5, "commute_time": 0.3, "violent_crime_rate": 0.2 },
  "acs_year": 2022
}
```

**Response:** Array of `Neighborhood` objects with `matchScore` (0–100), `tags`, centroid `lat`/`lng`, and per-feature breakdowns.

### `POST /rank-zips`
Same scoring logic as `/rank-neighborhoods` but returns raw z-scores, weights, and contributions instead of the frontend-shaped response. Useful for debugging model outputs.

### `POST /listings`
Fetches and filters live Redfin listings for a ZIP code.

**Request body:**
```json
{
  "zip": "78701",
  "beds": 3,
  "baths": 2,
  "property_type": "single_family",
  "min_price": 400000,
  "max_price": 700000,
  "min_sqft": 1500,
  "max_sqft": 3000
}
```

**Response:** Up to 6 listings with price, beds, baths, sqft, photos, and address.

### `POST /predict-appreciation`
Returns scenario-based appreciation projections.

**Request body:** Listing fields + optional user context.

**Response:**
```json
{
  "horizons": [6, 12, 36],
  "best":    [2.1, 4.8, 18.3],
  "average": [1.2, 2.9, 11.5],
  "worst":   [-0.5, 0.3, 3.1]
}
```
*(values in percent)*

### `POST /generate-summary`
Calls Gemini 2.5 Flash and returns a 3-paragraph narrative.

**Request body:** Full session data — user preferences, selected neighborhood, listing details, appreciation projections, monthly cost breakdown.

**Response:** `{ "summary": "<3-paragraph text>" }`

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+ / npm 10+
- API keys for Census, FBI, FRED, and Gemini (see [Environment Variables](#environment-variables))

### Environment Variables

Create a `.env` file at the **repo root**:

```env
CENSUS_API_KEY=your_census_key
FBI_API_KEY=your_fbi_cde_key
FRED_API_KEY=your_fred_key
GEMINI_API_KEY=your_gemini_key
```

FBI (`FBI_API_KEY`) and school rating (`GREATSCHOOLS_API_KEY`) features degrade gracefully — they are silently omitted from the score when the key is absent.

### Running the Backend

```bash
# From the repo root
python -m venv backend/venv
source backend/venv/bin/activate        # Windows: backend\venv\Scripts\activate
pip install -r requirements.txt

cd backend
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

To point the frontend at a non-default backend URL:

```bash
VITE_API_URL=http://your-backend-host:8000 npm run dev
```

> **Offline / demo mode:** If the backend is unreachable, the frontend automatically falls back to `mockData.ts` so the UI remains navigable without live API keys.

---

## ML Models

### Neighborhood Scoring (runtime, no pre-trained artifact)
Scores are computed at request time using z-score normalization against a national ZCTA reference distribution fetched from the Census ACS API. No serialized model file — the algorithm lives in `backend/scoring.py`.

### Appreciation Forecast (`models/appreciation_xgb.joblib`)
- **Algorithm:** XGBoost regressor
- **Targets:** Property appreciation (%) at 6, 12, and 36 months
- **Feature vector (29 dimensions):** Listing fields (price, beds, baths, sqft, lot size, year built, property type) + FRED macro indicators (mortgage rate, fed funds rate, unemployment, CPI) + derived features
- **Scenarios:** Best/avg/worst projections are generated by perturbing the macro inputs with fixed scenario deltas and running inference three times per horizon
- **Preprocessing metadata:** `models/preprocess_meta.json` stores feature names and scaler parameters loaded at startup

---

## Configuration

| Variable | Location | Description |
|---|---|---|
| `VITE_API_URL` | Frontend `.env` / shell | Backend base URL (default: `http://localhost:8000`) |
| `CENSUS_API_KEY` | Root `.env` | Required for all neighborhood scoring |
| `FBI_API_KEY` | Root `.env` | Optional — crime rate features |
| `FRED_API_KEY` | Root `.env` | Required for appreciation forecasting |
| `GEMINI_API_KEY` | Root `.env` | Required for `/listings` and `/generate-summary` |
| In-memory cache TTL | `backend/census.py`, `fbi.py`, `schools.py` | 12 hours for ACS/FBI/schools, 1 hour for listings |
| CORS origins | `backend/main.py` | `localhost:5173`, `localhost:3000`, `gshriivanth.github.io` |
