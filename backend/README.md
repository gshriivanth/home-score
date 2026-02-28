# Backend

This directory contains the Python FastAPI application that orchestrates all four stages of the HomeScore pipeline. It includes the REST API routes, business logic services, Pydantic data models, async external API clients (Walk Score, Google Places, Census, FRED, Zillow, listing APIs), PostgreSQL caching layer, and ML model inference wrappers. The backend loads pre-trained scikit-learn and XGBoost models at startup and serves them at zero marginal inference cost.
