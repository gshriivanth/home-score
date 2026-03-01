import type { Neighborhood, Listing } from '../context/PreferencesContext';

export const mockNeighborhoods: Neighborhood[] = [
  {
    id: '1',
    name: 'Riverside Heights',
    matchScore: 94,
    tags: ['Top-rated schools', 'Walkable', 'Green spaces', 'Family friendly'],
    location: { lat: 37.7749, lng: -122.4194 },
  },
  {
    id: '2',
    name: 'Downtown Core',
    matchScore: 88,
    tags: ['Nightlife', 'Transit hub', 'Dining scene', 'Urban energy'],
    location: { lat: 37.7849, lng: -122.4094 },
  },
  {
    id: '3',
    name: 'Oakwood Village',
    matchScore: 86,
    tags: ['Quiet streets', 'Very safe', 'Good schools', 'Community feel'],
    location: { lat: 37.7649, lng: -122.4294 },
  },
  {
    id: '4',
    name: 'Sunset District',
    matchScore: 82,
    tags: ['Affordable', 'Parks nearby', 'Family friendly', 'Diverse'],
    location: { lat: 37.7549, lng: -122.4394 },
  },
  {
    id: '5',
    name: 'Harbor Bay',
    matchScore: 79,
    tags: ['Waterfront', 'Walkable', 'Trendy', 'Great dining'],
    location: { lat: 37.7949, lng: -122.3994 },
  },
  {
    id: '6',
    name: 'Maple Grove',
    matchScore: 76,
    tags: ['Green spaces', 'Quiet', 'Suburban feel', 'Good commute'],
    location: { lat: 37.7449, lng: -122.4494 },
  },
];

export const mockListings: Listing[] = [
  {
    id: 'l1',
    neighborhoodId: '1',
    address: '245 Riverside Ave',
    price: 875000,
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2400,
    imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
  },
  {
    id: 'l2',
    neighborhoodId: '1',
    address: '1832 Oakmont Drive',
    price: 725000,
    bedrooms: 3,
    bathrooms: 2.5,
    sqft: 2100,
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
  },
  {
    id: 'l3',
    neighborhoodId: '1',
    address: '567 Willow Creek Rd',
    price: 950000,
    bedrooms: 5,
    bathrooms: 3.5,
    sqft: 3200,
    imageUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  },
  {
    id: 'l4',
    neighborhoodId: '1',
    address: '92 Heritage Lane',
    price: 685000,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1850,
    imageUrl: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800',
  },
  {
    id: 'l5',
    neighborhoodId: '1',
    address: '3401 Riverside Heights Blvd',
    price: 1100000,
    bedrooms: 5,
    bathrooms: 4,
    sqft: 3800,
    imageUrl: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
  },
  {
    id: 'l6',
    neighborhoodId: '1',
    address: '1205 Park Vista Way',
    price: 799000,
    bedrooms: 4,
    bathrooms: 2.5,
    sqft: 2300,
    imageUrl: 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800',
  },
  {
    id: 'l7',
    neighborhoodId: '2',
    address: '88 Downtown Plaza #1205',
    price: 625000,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1400,
    imageUrl: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800',
  },
  {
    id: 'l8',
    neighborhoodId: '2',
    address: '450 Market Street #802',
    price: 775000,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1750,
    imageUrl: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?w=800',
  },
];

export interface CostProjection {
  currentPrice: number;
  futurePrices: { year: number; best: number; worst: number; expected: number }[];
  maintenanceCosts: { year: number; cumulative: number; breakdown: Record<string, number> }[];
  monthlyBreakdown: {
    mortgage: number;
    propertyTax: number;
    insurance: number;
    hoa: number;
    maintenance: number;
  };
}

export const generateCostProjections = (price: number): CostProjection => {
  // Rough mortgage calc: 20% down, 7% rate, 30yr
  const principal = price * 0.8;
  const monthlyRate = 0.07 / 12;
  const payments = 360;
  const mortgage = Math.round(
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, payments))) /
      (Math.pow(1 + monthlyRate, payments) - 1),
  );

  return {
    currentPrice: price,
    futurePrices: [
      { year: 1, best: Math.round(price * 1.08), worst: Math.round(price * 0.97), expected: Math.round(price * 1.04) },
      { year: 3, best: Math.round(price * 1.27), worst: Math.round(price * 0.91), expected: Math.round(price * 1.12) },
      { year: 5, best: Math.round(price * 1.48), worst: Math.round(price * 0.88), expected: Math.round(price * 1.22) },
      { year: 10, best: Math.round(price * 2.16), worst: Math.round(price * 0.83), expected: Math.round(price * 1.48) },
    ],
    maintenanceCosts: [
      {
        year: 1,
        cumulative: 15000,
        breakdown: { 'Routine upkeep': 6000, 'HVAC service': 2500, Plumbing: 1500, Landscaping: 3000, Unexpected: 2000 },
      },
      {
        year: 3,
        cumulative: 52000,
        breakdown: { 'Routine upkeep': 18000, 'HVAC service': 7000, Plumbing: 5000, Landscaping: 9000, Roofing: 6000, Unexpected: 7000 },
      },
      {
        year: 5,
        cumulative: 98000,
        breakdown: { 'Routine upkeep': 30000, 'HVAC replacement': 14000, Plumbing: 9000, Landscaping: 15000, Roofing: 18000, Appliances: 5000, Unexpected: 7000 },
      },
      {
        year: 10,
        cumulative: 215000,
        breakdown: { 'Routine upkeep': 60000, 'HVAC replacement': 28000, Plumbing: 18000, Landscaping: 30000, Roofing: 36000, Appliances: 20000, Electrical: 8000, Unexpected: 15000 },
      },
    ],
    monthlyBreakdown: {
      mortgage,
      propertyTax: Math.round((price * 0.012) / 12),
      insurance: Math.round((price * 0.005) / 12),
      hoa: 350,
      maintenance: Math.round((price * 0.01) / 12),
    },
  };
};

export const generateLLMSummary = (neighborhood: Neighborhood, listing: Listing) => {
  return {
    neighborhoodMatch: `${neighborhood.name} scored ${neighborhood.matchScore}% based on your priorities. This area excels in ${neighborhood.tags.slice(0, 2).join(' and ')}, aligning well with your lifestyle preferences. The community maintains strong property values with a historical appreciation rate of 4.2% annually.`,
    houseFit: `The property at ${listing.address} offers ${listing.bedrooms} bedrooms and ${listing.bathrooms} bathrooms across ${listing.sqft.toLocaleString()} sqft. At $${(listing.price / 1000).toFixed(0)}K, it's priced competitively — approximately 8% below the neighborhood's per-sqft median. The layout and lot size provide excellent value with strong future flexibility.`,
    futureCosts: `Projected maintenance over the next 10 years ranges from $98K to $215K, covering routine upkeep, HVAC, roofing, and landscaping. Budget approximately $1,500–$2,000/month for ongoing costs. Property taxes and insurance add roughly $14,000 annually at current rates.`,
  };
};
