# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HomeScore is an AI-powered neighborhood and property recommendation platform built for IrvineHacks 2026 (Best Use of AI in Real Estate — First American Title). It guides users through a **four-stage sequential pipeline**: preference intake → neighborhood ranking → house filtering → future cost projections + LLM summary.

The project is currently in the scaffold stage. No application code has been committed yet.

## Intended Tech Stack

**Frontend:** React + Vite + TypeScript, Tailwind CSS + Shadcn/UI, Recharts (projection charts), optional Mapbox GL JS

**Backend:** Python FastAPI with asyncio + httpx for parallel external API calls

**ML:** scikit-learn (Random Forest classifier for neighborhoods), XGBoost (3 regression models for 6mo/1yr/3yr value projections), pandas + numpy, joblib for model serialization

**Database:** PostgreSQL (caches neighborhood feature vectors and API responses)

**Testing:** pytest

**Dev:** Docker + docker-compose

## Expected Commands (once implemented)

### Backend
```bash
# Start backend dev server
uvicorn app.main:app --reload

# Run tests
pytest

# Train models (offline, before serving)
python scripts/train_classification_model.py
python scripts/train_regression_models.py
```

### Frontend
```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

### Docker (full stack)
```bash
docker-compose up
```

## Four-Stage Architecture

The user cannot skip stages — each stage's output feeds the next.

**Stage 1 — Preference Intake:** Collects 12 neighborhood preference factors (area type, school quality, commute, safety, walkability, transit, family profile, nightlife, green space, neighborhood stability, HOA preference, budget range) and 12 physical house preference factors (beds, baths, sqft range, lot size, property type, price range, year built, garage, pool, stories). All stored in a `UserSession` object that drives every downstream stage.

**Stage 2 — Neighborhood Classification:** A Random Forest model scores every zip code in the target city against the user's preference weight vector, outputting a Neighborhood Match Score (0-100) per neighborhood. Personalization is achieved by multiplying neighborhood features by user priority weights before model input — no per-user retraining. Feature importances from `feature_importances_` are extracted (top 5) and passed to the LLM for explanation. Proxy labels are derived from composite objective metrics since no direct "neighborhood quality" ground truth exists.

**Stage 3 — House Filtering (Rule-Based, no ML):** Deterministic hard filters (price, beds, baths, sqft, property type, pool-if-required) exclude non-matching listings. Soft filters apply badge labels but keep listings. Listings are ranked by an additive relevance score (beds exact match +15, sqft within 10% of midpoint +15, baths exact +10, etc.). Top 10 shown. If fewer than 3 pass hard filters, the system identifies the most restrictive constraint and suggests relaxing it.

**Stage 4 — Projections + LLM Summary:** Three XGBoost models (one per time horizon: 6mo, 1yr, 3yr) predict future home value as percentage change, run twice each (optimistic vs pessimistic macroeconomic scenarios) for best/worst case. A rule-based maintenance cost estimator computes replacement probabilities using NAHB component lifecycle data. A single LLM call (claude-sonnet-4-6, temperature=0.3, ~1,500 token input, 800 token max output) generates a four-section structured summary. If the regression model is unavailable, an LLM fallback call with structured FRED economic data replaces it — labeled "AI Estimate" vs "Model Projection" in the UI.

## Key API Endpoints (FastAPI)

```
POST /preferences          — Submit city + preference intake, trigger neighborhood scoring
GET  /neighborhoods/{city} — Return ranked neighborhood list with match scores
GET  /homes/{zip_code}     — Fetch and filter listings in selected neighborhood
POST /project/{listing_id} — Run value regression + maintenance estimation
POST /summary              — Generate LLM HomeScore Summary from full session context
```

## Data Sources

- **Zillow Research ZHVI CSVs** — historical median prices by zip (training + CAGR runtime)
- **Census ACS API** — demographics, income, population growth
- **Walk Score API** — walkability and transit scores (~$0.002/call, cached per neighborhood)
- **Google Places API** — POI counts for restaurants, parks, hospitals, groceries (~$0.003/call, cached)
- **FRED API** — real-time mortgage rate, Fed Funds Rate, Case-Shiller index, unemployment (free, called fresh per session)
- **NCES Common Core** — school ratings by zip
- **FBI UCR / local crime data** — crime index
- **Zillow Bridge / RapidAPI** — active listings in selected neighborhood (~$0.01/call or free tier)
- **County assessor records** — historical transaction pairs for regression model training

PostgreSQL caches neighborhood feature vectors after first fetch; cold-start cost ~$0.20-0.30/session, cached ~$0.04-0.08.

## LLM Configuration

- **Model:** `claude-sonnet-4-6` (primary) or `gpt-4o`
- **Temperature:** 0.3
- **Max input:** ~1,500 tokens; **Max output:** 800 tokens
- **System prompt role:** "You are a real estate financial analyst explaining property recommendations to a first-time homebuyer. Be specific, cite the data provided, and never add information not present in the input payload."
- **Max 2 LLM calls per session** (1 summary + 1 optional fallback)

## ML Model Details

**Neighborhood Classification (scikit-learn Random Forest):**
- Trained on Orange County, CA (~30 zip codes) for hackathon demo
- Proxy labeling: composite of school rating, crime rate, appreciation CAGR, walk score, income → binned into 4 tiers
- Validation: 5-fold cross-validation, target F1-macro ≥ 0.80
- Hyperparameter tuning: GridSearchCV on n_estimators, max_depth, min_samples_split
- Serialized via joblib for FastAPI serving

**Future Value Regression (XGBoost — 3 separate instances):**
- Target: percentage change in home value at T+horizon months
- Training: Orange County transactions pre-2022; test: 2022–2024; MAPE targets <10% (6mo), <14% (1yr), <18% (3yr)
- Features: property attributes + neighborhood CAGR/inventory/YoY change + FRED macroeconomic data
- Best/worst case: model run twice with optimistic vs pessimistic macro feature perturbations

**Maintenance Cost Estimator (deterministic rule engine):**
- No ML training; calibrated from NAHB lifecycle data and RSMeans cost guides
- Computes replacement probability per component: `component_age / expected_lifespan`
- Flags components with >70% replacement probability within horizon
- Annual base maintenance: 1.0–1.5% of listing price

## Core Data Models (from PRD)

Key classes to implement: `UserSession`, `NeighborhoodPrefs`, `HousePrefs`, `NeighborhoodFeatureVector`, `ClassificationModel`, `ListingRecord`, `RuleFilterEngine`, `RegressionModel`, `MaintenanceEstimator`, `LLMFallback`, `LLMSummaryGenerator`, `HomeScoreSession`.

## Hard Filter vs Soft Filter Distinction

This distinction is architecturally critical in Stage 3:
- **Hard filters** exclude listings entirely (price, beds, baths, sqft, property type, pool-if-required)
- **Soft filters** keep listings but add badge labels (lot size, year built, garage, stories, min price)

Never apply soft filter logic as exclusion — flagging with badges is the correct behavior.
