**Overview**
HomeScore is an end-to-end home selection pipeline: users choose a city, rank what matters most, specify home requirements, review ranked neighborhoods, browse live listings, and finish with a cost + appreciation summary. The system is split into a FastAPI backend (`backend/`) that aggregates public data and computes scores, a React + Vite frontend (`frontend/`) that drives the multi-step UX, and model artifacts in `models/`. A minimal root `index.html` supports GitHub Pages.

**Repo Layout (Top Level)**
- `backend/`: FastAPI service, data clients, scoring, and listing scrape logic.
- `frontend/`: React + TypeScript SPA with Tailwind and component library wrappers.
- `models/`: Serialized ML artifacts and a training notebook.
- `docs/`: Product requirements doc (`HomeScore_PRD_v2.pdf`).
- `requirements.txt`: Backend Python dependencies (installed from repo root).
- `test_zips.py`: Small async utility to verify ZIP lookup.
- `index.html`: Minimal static page used for GH Pages placeholder.
- `package-lock.json`: Root lockfile (separate from `frontend/package-lock.json`).

**Backend — FastAPI App (`backend/main.py`)**
- Application title: “HomeScore API”, version `0.1.0`.
- CORS allowed: `http://localhost:5173`, `http://localhost:3000`, and `https://gshriivanth.github.io`.
- Startup loads the appreciation model into `app.state` via `load_model_artifacts()`.

**Backend Endpoints**
- `GET /health`: returns `{ "status": "ok" }`.
- `POST /rank-zips`: returns ranked ZIPs with raw values, z-scores, weights, and contributions.
- `POST /rank-neighborhoods`: same scores shaped to match the frontend’s `Neighborhood[]` interface and map display.
- `POST /listings`: returns up to 5 Redfin listings scraped from search + detail pages.
- `POST /predict-appreciation`: returns best/avg/worst appreciation projections for 6/12/36 months.
- `POST /generate-summary`: calls Gemini to return a 3-paragraph narrative explanation.

**Ranking Pipeline (Shared by `/rank-zips` and `/rank-neighborhoods`)**
- Validates state abbreviation against a built-in `STATE_FIPS` map.
- Validates that every feature requested is supported across Census, FBI, and GreatSchools.
- Requires at least one Census ACS feature in the request.
- Resolves ZIPs for a city via Zippopotam.us; if missing, falls back to “all state ZCTAs” (slower).
- Fetches ACS data for selected features and then optionally merges FBI + GreatSchools features.
- Fetches national ACS data for z-score normalization so scores are comparable across cities.
- Computes directional z-scores, applies weights, and returns sorted ranks + warnings.

**Scoring Logic (`backend/scoring.py`)**
- Standardizes each feature via z-score using national reference stats when available.
- Missing values are imputed to the mean (z=0) and noted in warnings.
- Directionality flips (e.g., lower crime = better) before weighted sum.
- Outputs per-feature contribution and a total weighted score; then ranks by descending score.

**Data Sources & Features**
- Census ACS 5-year API (`backend/census.py`)
- Features: `income`, `commute_time`, `pct_bachelors`, `pct_households_children`, `racial_diversity_index`.
- Caching: in-memory TTL cache (12 hours).
- FBI Crime Data Explorer (`backend/fbi.py`)
- Features: `violent_crime_rate`, `property_crime_rate` (per 1,000 residents).
- Rate-limited concurrency and 12-hour cache; optional if API key missing.
- GreatSchools (`backend/schools.py`)
- Feature: `avg_school_rating` (mean of nearby schools).
- Rate-limited concurrency and 12-hour cache; optional if API key missing.
- ZIP lookup and centroids (`backend/geo.py`)
- Uses Zippopotam.us for city→ZIP and ZIP→lat/lng resolution.

**Listings Pipeline (`backend/listings.py`)**
- Builds a Redfin ZIP search URL using min beds/baths (price, sqft, and type are not embedded in the URL).
- Scrapes listings with three strategies in order: large JSON blobs, `window.__reactServerAgent` assignments, and HTML card parsing.
- Currently bypasses filtering and returns the first 5 scraped listings (`filtered = raw[:5]`).
- Fills missing fields with user preferences and adds stock images when needed.
- Scrapes detail pages in parallel to enrich missing photos and property fields.
- Caching: in-memory TTL cache (1 hour).
- `/listings` requires `GEMINI_API_KEY` even though the current implementation uses Redfin scraping.

**Appreciation Model (`backend/appreciation.py`)**
- Loads `models/appreciation_xgb.joblib` plus `models/preprocess_meta.json` at startup.
- Builds a 29-element feature vector combining listing fields + macro indicators.
- Uses FRED series: mortgage rate, fed funds, unemployment, CPI.
- Scenarios are built by perturbing macro inputs (best/avg/worst deltas) and running the same model per horizon.

**Summary Generation (`/generate-summary`)**
- Builds a structured data block containing user preferences, neighborhood features, listing details, appreciation projections, and monthly costs.
- Gemini model: `gemini-2.5-flash` with a fixed 3-paragraph system prompt.
- Requires `GEMINI_API_KEY`; errors return HTTP 502 with the Gemini error detail.

**Backend Models (`backend/models.py`)**
- Pydantic schemas for all request/response shapes.
- Weights are normalized at the request layer if they don’t sum to 1.0.
- Neighborhood responses include `matchScore`, tags, and location to match frontend requirements.

**Frontend — Architecture**
- React + Vite + TypeScript in `frontend/`.
- Routing via `react-router` with a shared `Layout` and `Header` progress indicator.
- App state centralized in `PreferencesContext` (city, priorities, home requirements, selection state, appreciation projections).
- Dark UI styling with Tailwind utilities and Radix/shadcn UI primitives.

**Frontend — Route Flow (`frontend/src/app/routes.ts`)**
- `/` → `CityInput`
- `/priorities` → `PriorityRanking`
- `/preferences` → `PreferenceIntake`
- `/neighborhoods` → `NeighborhoodRankings`
- `/listings` → `HouseListings`
- `/summary` → `CostSummary`

**Frontend — Key Screens**
- `CityInput`: city selection with autocomplete from Nominatim (OpenStreetMap), popular city shortcuts, and debounced suggestions.
- `PriorityRanking`: ranks 8 categories, enforces at least one Census feature before proceeding.
- `PreferenceIntake`: collects bedrooms, bathrooms, property type, budget, sqft range, lot size, garage/pool, year built.
- `NeighborhoodRankings`: calls `/rank-neighborhoods`, uses Leaflet map, falls back to mock data on API failure, and geocodes the city via Nominatim to set map center.
- `HouseListings`: calls `/listings`, shows grid + detailed listing view, and calls `/predict-appreciation` for charts.
- `CostSummary`: generates cost projections locally, calls `/generate-summary`, and streams Gemini output word-by-word.

**Frontend — API Client (`frontend/src/app/api/index.ts`)**
- Default `BASE_URL` is `http://localhost:8000` unless `VITE_API_URL` is set.
- Ranked priorities are converted into weighted features with fixed rank tiers.
- Requests `acs_year: 2022` by default when ranking neighborhoods.
- Supports API calls for rankings, listings, appreciation, and summary generation.

**Mock Data & Projections**
- `frontend/src/app/data/mockData.ts` provides fallback neighborhoods and listings.
- Cost projections assume 20% down, 7% interest, and fixed maintenance + HOA heuristics.
- `generateLLMSummary` returns a static, templated summary (not currently used in the main flow).

**Models & Artifacts**
- `models/` contains `appreciation_xgb.joblib`, `preprocess_meta.json`, and a training notebook.
- `models/README.md` references additional model files (neighborhood classifier + regression variants) that are not present in the directory.

**Configuration & Dependencies**
- Backend dependencies are defined in `requirements.txt` at repo root.
- Frontend dependencies in `frontend/package.json` with a full `frontend/package-lock.json`.
- Local environments: `backend/venv` and `frontend/node_modules` are present in the repo.
- Environment variables referenced: `CENSUS_API_KEY`, `FBI_API_KEY`, `GREATSCHOOLS_API_KEY`, `GEMINI_API_KEY`, `FRED_API_KEY` (a `.env` file exists at repo root).

**Current State Highlights**
- The core end-to-end pipeline is wired and functional in code: ranking → listings → appreciation → summary.
- External data availability is key for real results (Census + FBI + GreatSchools + FRED + Gemini).
- Listings scraping is active but currently returns the first 5 scraped results rather than filtered matches.
- The frontend includes robust fallback paths (mock data, error banners, and retries) when the backend is unavailable.
