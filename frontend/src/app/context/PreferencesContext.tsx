import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface HouseRequirements {
  bedrooms: number;
  bathrooms: number;
  sqftMin: number;
  sqftMax: number;
  minPrice: number;
  maxPrice: number;
  lotSize: 'any' | 'small' | 'medium' | 'large';
  propertyType: 'any' | 'single-family' | 'townhouse' | 'condo';
  yearBuilt: 'any' | 'pre-1990' | '1990-2010' | '2010-2020' | '2020+';
  garage: boolean;
  pool: boolean;
  stories: number;
}

export interface NeighborhoodFeature {
  raw_value: number | null;
  z_score: number | null;
  weight: number;
  contribution: number | null;
}

export interface Neighborhood {
  id: string;
  name: string;
  matchScore: number;
  tags: string[];
  location: { lat: number; lng: number };
  features?: Record<string, NeighborhoodFeature>;
}

export interface AppreciationProjection {
  months: number;
  best: { appreciation_pct: number; projected_value: number | null };
  avg: { appreciation_pct: number; projected_value: number | null };
  worst: { appreciation_pct: number; projected_value: number | null };
}

export interface Listing {
  id: string;
  neighborhoodId: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  imageUrl: string;
  // Extended fields from GeminiListing
  yearBuilt?: number;
  propertyType?: string;
  garage?: boolean;
  pool?: boolean;
  stories?: number;
  lotSizeSqft?: number;
  hoaMonthly?: number;
  daysOnMarket?: number;
  pricePerSqft?: number;
  description?: string;
}

interface PreferencesContextType {
  city: string;
  setCity: (city: string) => void;
  rankedPriorities: string[];
  setRankedPriorities: (priorities: string[]) => void;
  houseRequirements: HouseRequirements;
  setHouseRequirements: (reqs: HouseRequirements) => void;
  selectedNeighborhood: Neighborhood | null;
  setSelectedNeighborhood: (neighborhood: Neighborhood | null) => void;
  selectedListing: Listing | null;
  setSelectedListing: (listing: Listing | null) => void;
  appreciationData: AppreciationProjection[] | null;
  setAppreciationData: (data: AppreciationProjection[] | null) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [city, setCity] = useState('');
  const [rankedPriorities, setRankedPriorities] = useState<string[]>([]);

  const [houseRequirements, setHouseRequirements] = useState<HouseRequirements>({
    bedrooms: 3,
    bathrooms: 2,
    sqftMin: 1500,
    sqftMax: 3000,
    minPrice: 400000,
    maxPrice: 800000,
    lotSize: 'any',
    propertyType: 'any',
    yearBuilt: 'any',
    garage: false,
    pool: false,
    stories: 0,
  });

  const [selectedNeighborhood, setSelectedNeighborhood] = useState<Neighborhood | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [appreciationData, setAppreciationData] = useState<AppreciationProjection[] | null>(null);

  return (
    <PreferencesContext.Provider
      value={{
        city,
        setCity,
        rankedPriorities,
        setRankedPriorities,
        houseRequirements,
        setHouseRequirements,
        selectedNeighborhood,
        setSelectedNeighborhood,
        selectedListing,
        setSelectedListing,
        appreciationData,
        setAppreciationData,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
