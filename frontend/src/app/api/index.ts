/**
 * HomeScore API client
 *
 * Calls POST /rank-neighborhoods on the FastAPI backend and converts
 * the user's ranked priorities into ACS feature weights.
 */

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

// ─── ACS feature metadata ─────────────────────────────────────────────────────

/** Whether a higher raw value is good for this ACS feature. */
const FEATURE_DIRECTION: Record<string, boolean> = {
  income: true,   // higher income is better
  median_rent: false,  // lower rent is better
  median_home_value: false,  // lower home value is better (affordability)
  commute_time: false,  // lower commute time is better
  pct_bachelors: true,   // higher education share is better
};

// ─── Priority → feature mapping ───────────────────────────────────────────────

/**
 * Maps each of the 12 frontend priority IDs to one or more backend ACS
 * feature names.  When a priority maps to multiple features, the priority's
 * weight is split equally across them.
 *
 * Priorities that have no direct ACS equivalent are proxied to the closest
 * available signal (documented inline).
 */
const PRIORITY_FEATURE_MAP: Record<string, string[]> = {
  safety: ['income'],                       // wealthier ZIPs correlate with lower crime
  education: ['pct_bachelors'],
  diversity: ['pct_bachelors'],                // proxy: education diversity
  commute: ['commute_time'],
  walkability: ['commute_time'],                 // walkable areas → short commutes
  transit: ['commute_time'],                 // good transit → short commutes
  greenspace: ['income'],                       // park infrastructure tracks wealth
  family: ['pct_bachelors', 'income'],      // split equally
  nightlife: ['income'],                       // entertainment areas track income
  dining: ['income'],
  quiet: ['median_rent'],                  // lower rent → more suburban/quiet
  community: ['pct_bachelors'],
};

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
 * Convert an ordered list of priority IDs into a list of ACS FeatureWeights.
 *
 * Weight decay: rank-1 priority gets weight 1/1, rank-2 gets 1/2, etc.,
 * then everything is normalised to sum to 1.
 */
function buildFeatureWeights(rankedPriorities: string[]): FeatureWeight[] {
  if (rankedPriorities.length === 0) {
    // Default: equal weight across all five features when no priorities given
    const defaults: FeatureWeight[] = Object.entries(FEATURE_DIRECTION).map(([name, hib]) => ({
      name,
      weight: 1 / Object.keys(FEATURE_DIRECTION).length,
      higher_is_better: hib,
    }));
    return defaults;
  }

  // 1/rank raw weights
  const rawWeights = rankedPriorities.map((_, i) => 1 / (i + 1));
  const totalRaw = rawWeights.reduce((a, b) => a + b, 0);

  // Accumulate weight per ACS feature
  const featureWeightMap: Record<string, number> = {};
  rankedPriorities.forEach((priority, i) => {
    const normalised = rawWeights[i] / totalRaw;
    const features = PRIORITY_FEATURE_MAP[priority] ?? ['income'];
    const perFeature = normalised / features.length;
    features.forEach((f) => {
      featureWeightMap[f] = (featureWeightMap[f] ?? 0) + perFeature;
    });
  });

  return Object.entries(featureWeightMap).map(([name, weight]) => ({
    name,
    weight,
    higher_is_better: FEATURE_DIRECTION[name] ?? true,
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
