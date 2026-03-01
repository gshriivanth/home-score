/**
* HomeScore API client
*
* Calls POST /rank-neighborhoods on the FastAPI backend and converts
* the user's ranked priorities into ACS feature weights.
*/


const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';


// ─── Feature metadata ─────────────────────────────────────────────────────────


/** Whether a higher raw value is good for this backend feature. */
const FEATURE_DIRECTION: Record<string, boolean> = {
  violent_crime_rate: false,  // lower violent crime is better
  property_crime_rate: false,  // lower property crime is better
  avg_school_rating: true,   // higher school rating is better
  income: true,   // higher income is better
  commute_time: false,  // lower commute time is better
  pct_bachelors: true,   // higher education share is better
  racial_diversity_index: true,   // higher diversity is better
  pct_households_children: true,   // more family households is better
};


/**
* Predefined weight tiers for rank positions 1–8.
* Rank 1 (most important) gets the highest weight.
* When fewer than 8 features are selected, the first k tiers are used
* and normalised to sum to 1 by the backend.
*/
const RANK_WEIGHTS = [0.22, 0.18, 0.15, 0.14, 0.12, 0.09, 0.06, 0.04];


// ─── Helpers ──────────────────────────────────────────────────────────────────


/** Parse "San Francisco, CA" → { city: "San Francisco", state: "CA" }. */
function parseCityState(input: string): { city: string; state: string } {
  const match = input.trim().match(/^(.+),\s*([A-Za-z]{2})$/);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  return { city: input.trim(), state: 'CA' }; // fallback if no state given
}


interface FeatureWeight {
  name: string;
  weight: number;
  higher_is_better: boolean;
}


/**
* Convert an ordered list of feature IDs into backend FeatureWeights.
*
* Each card ID is already a backend feature name (1:1 mapping).
* Weights follow predefined tiers so higher-ranked features always
* carry more weight, even when only a subset is selected.
*/
function buildFeatureWeights(rankedPriorities: string[]): FeatureWeight[] {
  if (rankedPriorities.length === 0) {
    return Object.entries(FEATURE_DIRECTION).map(([name, hib]) => ({
      name,
      weight: 1 / Object.keys(FEATURE_DIRECTION).length,
      higher_is_better: hib,
    }));
  }


  const tiers = RANK_WEIGHTS.slice(0, rankedPriorities.length);
  const total = tiers.reduce((a, b) => a + b, 0);


  return rankedPriorities.map((featureName, i) => ({
    name: featureName,
    weight: tiers[i] / total,
    higher_is_better: FEATURE_DIRECTION[featureName] ?? true,
  }));
}


// ─── Response types ───────────────────────────────────────────────────────────


export interface ApiNeighborhood {
  id: string;           // ZIP code
  name: string;         // "ZIP 92617"
  matchScore: number;   // 0-100 rescaled score
  tags: string[];
  location: { lat: number; lng: number };
  zip: string;
  score: number;        // raw weighted z-score
}


export interface RankNeighborhoodsResponse {
  city: string;
  state: string;
  year: number;
  total_zips_scored: number;
  neighborhoods: ApiNeighborhood[];
  warnings: string[];
}


// ─── Main API call ────────────────────────────────────────────────────────────


export async function rankNeighborhoods(
  cityInput: string,
  rankedPriorities: string[],
): Promise<RankNeighborhoodsResponse> {
  const { city, state } = parseCityState(cityInput);
  const features = buildFeatureWeights(rankedPriorities);

  console.log('[API] rankNeighborhoods called:', { cityInput, rankedPriorities, features });

  const response = await fetch(`${BASE_URL}/rank-neighborhoods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city, state, acs_year: 2022, features }),
  });


  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`API ${response.status}: ${text}`);
  }


  return response.json() as Promise<RankNeighborhoodsResponse>;
}


// ─── Gemini listing types ─────────────────────────────────────────────────────

export interface GeminiListing {
  id: string;
  neighborhoodId: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt?: number;
  lotSizeSqft?: number;
  propertyType?: string;
  garage: boolean;
  pool: boolean;
  stories?: number;
  daysOnMarket?: number;
  hoaMonthly?: number;
  pricePerSqft?: number;
  description: string;
  zillowUrl: string;
  imageUrl: string;
  agentName?: string;
  brokerageName?: string;
  source?: string;
}

export async function getListing(
  zipCode: string,
  city: string,
  state: string,
  bedrooms: number,
  bathrooms: number,
  minPrice: number,
  maxPrice: number,
  sqftMin: number,
  sqftMax: number,
  propertyType: string,
  garage: boolean,
  pool: boolean,
  yearBuilt: string,
): Promise<GeminiListing> {
  const response = await fetch(`${BASE_URL}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      zip_code: zipCode,
      city,
      state,
      bedrooms,
      bathrooms,
      min_price: minPrice,
      max_price: maxPrice,
      sqft_min: sqftMin,
      sqft_max: sqftMax,
      property_type: propertyType,
      garage,
      pool,
      year_built: yearBuilt,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Listings API ${response.status}: ${text}`);
  }

  return response.json() as Promise<GeminiListing>;
}


// ─── Appreciation prediction types ───────────────────────────────────────────

export interface ScenarioResult {
  appreciation_pct: number;
  projected_value: number | null;
}

export interface HorizonProjection {
  months: number;
  best: ScenarioResult;
  avg: ScenarioResult;
  worst: ScenarioResult;
}

export interface AppreciationPredictionResponse {
  projections: HorizonProjection[];
  warnings: string[];
}

export interface AppreciationPredictionRequest {
  price: number;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number;
  propertyType: string;
  zip: string;
  state: string;
  garage?: boolean;
  pool?: boolean;
  latitude?: number;
  longitude?: number;
  lot_size_sqft?: number;
  stories?: number;
  county?: string;
}

export async function predictAppreciation(
  listing: AppreciationPredictionRequest
): Promise<AppreciationPredictionResponse> {
  const response = await fetch(`${BASE_URL}/predict-appreciation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(listing),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Appreciation API ${response.status}: ${text}`);
  }

  return response.json() as Promise<AppreciationPredictionResponse>;
}
