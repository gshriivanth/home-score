# Frontend

This directory contains the React + Vite + TypeScript single-page application that walks users through the four sequential stages of HomeScore. It uses Tailwind CSS and Shadcn/UI for components, Recharts for future value projection line charts, and optionally Mapbox GL JS for the neighborhood score heatmap. All stage-to-stage state (session ID, selected neighborhood, selected listing) is managed via React Context and persisted through API calls to the backend.
