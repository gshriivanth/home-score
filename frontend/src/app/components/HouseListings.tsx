import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { getListings, predictAppreciation, type GeminiListing, type AppreciationPredictionResponse } from '../api';
import { AppreciationChart } from './AppreciationChart';
import {
  Bed, Bath, Maximize, ArrowLeft, Loader2,
  AlertCircle, Calendar, Car, Waves, Home, Clock, DollarSign, RefreshCw, User, ChevronLeft,
} from 'lucide-react';


function parseCityState(input: string): { city: string; state: string } {
  const match = input.trim().match(/^(.+),\s*([A-Za-z]{2})$/);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  return { city: input.trim(), state: 'CA' };
}


const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`;


export const HouseListings: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedNeighborhood,
    setSelectedListing,
    setAppreciationData,
    houseRequirements,
    city,
  } = usePreferences();

  const [listings, setListings] = useState<GeminiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<GeminiListing | null>(null);
  const [localAppreciationData, setLocalAppreciationData] = useState<AppreciationPredictionResponse | null>(null);
  const [appreciationLoading, setAppreciationLoading] = useState(false);


  if (!selectedNeighborhood) {
    navigate('/neighborhoods');
    return null;
  }


  const { city: parsedCity, state } = parseCityState(city);


  const fetchListings = () => {
    setLoading(true);
    setError(null);
    setListings([]);
    setSelectedDetail(null);
    setAppreciationData(null);
    setLocalAppreciationData(null);
    setAppreciationLoading(false);

    getListings(
      selectedNeighborhood.id,
      parsedCity,
      state,
      houseRequirements.bedrooms,
      houseRequirements.bathrooms,
      houseRequirements.minPrice,
      houseRequirements.maxPrice,
      houseRequirements.sqftMin,
      houseRequirements.sqftMax,
      houseRequirements.propertyType,
      houseRequirements.garage,
      houseRequirements.pool,
      houseRequirements.yearBuilt,
    )
      .then((data: GeminiListing[]) => {
        setListings(data);
        setLoading(false);
      })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  };


  useEffect(() => { fetchListings(); }, [selectedNeighborhood.id]);


  // Open the detail view for a listing and fetch appreciation data
  const openDetail = (listing: GeminiListing) => {
    setSelectedDetail(listing);
    setAppreciationData(null);

    if (listing.yearBuilt && listing.price && listing.sqft) {
      setAppreciationLoading(true);
      predictAppreciation({
        price: listing.price,
        sqft: listing.sqft,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        yearBuilt: listing.yearBuilt,
        propertyType: listing.propertyType || 'House',
        zip: selectedNeighborhood.id,
        state: state,
        garage: listing.garage,
        pool: listing.pool,
        latitude: undefined,
        longitude: undefined,
        lot_size_sqft: listing.lotSizeSqft,
        stories: listing.stories,
      })
        .then((resp) => {
          setLocalAppreciationData(resp);
          setAppreciationData(resp.projections);
          setAppreciationLoading(false);
        })
        .catch((err: Error) => {
          console.error('Appreciation prediction failed:', err);
          setLocalAppreciationData(null);
          setAppreciationLoading(false);
        });
    }
  };


  const handleSelect = (listing: GeminiListing) => {
    setSelectedListing({
      id: listing.id,
      neighborhoodId: listing.neighborhoodId,
      address: listing.address,
      price: listing.price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      sqft: listing.sqft,
      imageUrl: listing.imageUrl,
      // Extended fields for the AI summary
      yearBuilt: listing.yearBuilt,
      propertyType: listing.propertyType,
      garage: listing.garage,
      pool: listing.pool,
      stories: listing.stories,
      lotSizeSqft: listing.lotSizeSqft,
      hoaMonthly: listing.hoaMonthly,
      daysOnMarket: listing.daysOnMarket,
      pricePerSqft: listing.pricePerSqft,
      description: listing.description,
    });
    navigate('/summary');
  };


  // ─── Detail view ──────────────────────────────────────────────────────────
  if (selectedDetail) {
    const listing = selectedDetail;
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <button
          onClick={() => setSelectedDetail(null)}
          className="flex items-center gap-2 text-slate-400 hover:text-[#1AAFD4] transition-colors text-sm font-medium mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Listings
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-slate-100">Live Redfin Listing</h1>
            <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-full border border-blue-800/40 uppercase tracking-wide">
              Real Data
            </span>
          </div>
          <p className="text-slate-400">
            Best match found for{' '}
            <span className="text-[#1AAFD4] font-semibold">{selectedNeighborhood.name}</span>
            <span className="ml-2 px-2.5 py-0.5 bg-[#1AAFD4]/10 text-[#1AAFD4] text-sm font-semibold rounded-full border border-[#1AAFD4]/30">
              {selectedNeighborhood.matchScore}% match
            </span>
          </p>
        </div>

        <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 shadow-xl shadow-black/40">

          {/* Hero image */}
          <div className="relative aspect-[16/7] overflow-hidden">
            <img src={listing.imageUrl} alt={listing.address} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
            {listing.daysOnMarket != null && (
              <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 backdrop-blur rounded-full text-slate-300 text-xs font-medium">
                <Clock className="w-3.5 h-3.5 text-yellow-400" />
                {listing.daysOnMarket} days on market
              </div>
            )}
          </div>

          <div className="p-8">
            {/* Price + address */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <div className="text-4xl font-bold text-[#1AAFD4] mb-1">{fmt(listing.price)}</div>
                <div className="text-slate-200 text-lg font-medium leading-snug">{listing.address}</div>
              </div>
              {listing.propertyType && (
                <span className="px-3 py-1.5 bg-[#1AAFD4]/10 text-[#1AAFD4] text-sm font-semibold rounded-full border border-[#1AAFD4]/30">
                  {listing.propertyType}
                </span>
              )}
            </div>

            {/* Primary spec grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {([
                { icon: Bed, label: 'Bedrooms', value: String(listing.bedrooms) },
                { icon: Bath, label: 'Bathrooms', value: String(listing.bathrooms) },
                { icon: Maximize, label: 'Interior', value: `${listing.sqft.toLocaleString()} sqft` },
                ...(listing.yearBuilt ? [{ icon: Calendar, label: 'Year Built', value: String(listing.yearBuilt) }] : []),
                ...(listing.lotSizeSqft ? [{ icon: Home, label: 'Lot Size', value: `${listing.lotSizeSqft.toLocaleString()} sqft` }] : []),
                ...(listing.pricePerSqft ? [{ icon: DollarSign, label: 'Price/sqft', value: `$${listing.pricePerSqft}` }] : []),
              ] as { icon: React.ElementType; label: string; value: string }[]).map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-slate-700/50 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-[#1AAFD4]" />
                    <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</span>
                  </div>
                  <div className="text-slate-100 font-bold text-lg">{value}</div>
                </div>
              ))}
            </div>

            {/* Secondary info row */}
            <div className="flex flex-wrap gap-2 mb-5">
              {listing.garage && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 rounded-full text-slate-300 text-sm">
                  <Car className="w-3.5 h-3.5 text-slate-400" /> Garage
                </span>
              )}
              {listing.pool && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 rounded-full text-slate-300 text-sm">
                  <Waves className="w-3.5 h-3.5 text-slate-400" /> Pool
                </span>
              )}
              {listing.hoaMonthly != null && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 rounded-full text-slate-300 text-sm">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" /> HOA ${listing.hoaMonthly}/mo
                </span>
              )}
              {listing.stories != null && (
                <span className="px-3 py-1.5 bg-slate-700 rounded-full text-slate-300 text-sm">
                  {listing.stories} {listing.stories === 1 ? 'story' : 'stories'}
                </span>
              )}
              <span className="px-3 py-1.5 bg-slate-700 rounded-full text-slate-400 text-sm font-mono">
                ZIP {selectedNeighborhood.id}
              </span>
            </div>

            {/* Listing description */}
            {listing.description && (
              <div className="bg-slate-700/40 border border-slate-600/50 rounded-xl p-5 mb-5">
                <p className="text-slate-300 text-sm leading-relaxed italic">"{listing.description}"</p>
              </div>
            )}

            {/* Appreciation Chart */}
            {appreciationLoading && (
              <div className="bg-slate-700/40 border border-slate-600/50 rounded-xl p-8 mb-5 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#1AAFD4] animate-spin mr-3" />
                <span className="text-slate-400">Loading appreciation predictions...</span>
              </div>
            )}

            {localAppreciationData && !appreciationLoading && (
              <div className="mb-5">
                <AppreciationChart
                  projections={localAppreciationData.projections}
                  currentPrice={listing.price}
                />
              </div>
            )}

            {/* Agent info */}
            {(listing.agentName || listing.brokerageName) && (
              <div className="flex items-center gap-2 mb-6 text-slate-500 text-sm">
                <User className="w-4 h-4" />
                <span>
                  Listed by {listing.agentName ?? 'Agent'}
                  {listing.brokerageName ? ` · ${listing.brokerageName}` : ''}
                </span>
              </div>
            )}

            {/* CTA buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => handleSelect(listing)}
                className="flex-1 py-3.5 rounded-xl bg-[#1AAFD4] hover:bg-[#1788B2] text-[#1a1a1a] font-bold transition-colors shadow-lg shadow-[#1AAFD4]/20"
              >
                Select This Home →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // ─── Grid view ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/neighborhoods')}
        className="flex items-center gap-2 text-slate-400 hover:text-[#1AAFD4] transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Neighborhoods
      </button>


      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-bold text-slate-100">Live Redfin Listings</h1>
          <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-full border border-blue-800/40 uppercase tracking-wide">
            Real Data
          </span>
        </div>
        <p className="text-slate-400">
          Active listings in{' '}
          <span className="text-[#1AAFD4] font-semibold">{selectedNeighborhood.name}</span>
          <span className="ml-2 px-2.5 py-0.5 bg-[#1AAFD4]/10 text-[#1AAFD4] text-sm font-semibold rounded-full border border-[#1AAFD4]/30">
            {selectedNeighborhood.matchScore}% match
          </span>
        </p>
      </div>


      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-[#1AAFD4]/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-[#1AAFD4] animate-spin" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#1AAFD4] rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">R</span>
            </div>
          </div>
          <h3 className="text-xl font-semibold text-slate-200 mb-2">Searching Redfin...</h3>
          <p className="text-slate-500 text-sm max-w-sm">
            Scanning active listings in ZIP <span className="text-[#1AAFD4] font-mono">{selectedNeighborhood.id}</span> that match your {houseRequirements.bedrooms}bd / {houseRequirements.bathrooms}ba requirements.
          </p>
          <div className="mt-6 flex gap-2">
            {[0, 200, 400].map((d) => (
              <div key={d} className="w-2 h-2 rounded-full bg-[#1AAFD4] animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      )}


      {/* Error */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-800/50 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <div>
            <h3 className="text-lg font-semibold text-red-300 mb-1">Couldn't find listings</h3>
            <p className="text-red-400/80 text-sm font-mono">{error}</p>
          </div>
          <button
            onClick={fetchListings}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}


      {/* Listings grid */}
      {listings.length > 0 && !loading && !error && (
        <>
          <div className="flex items-center justify-between mb-6">
            <p className="text-slate-400 text-sm">
              <span className="text-[#1AAFD4] font-semibold">{listings.length} listing{listings.length !== 1 ? 's' : ''}</span> found
            </p>
            <button
              onClick={fetchListings}
              title="Refresh listings"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <button
                key={listing.id}
                onClick={() => openDetail(listing)}
                className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 hover:border-[#1AAFD4]/60 transition-all text-left group shadow-lg shadow-black/30 hover:shadow-[#1AAFD4]/10"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-700">
                  <img
                    src={listing.imageUrl}
                    alt={listing.address}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {listing.daysOnMarket != null && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 backdrop-blur rounded-full text-slate-300 text-xs font-medium">
                      <Clock className="w-3 h-3 text-yellow-400" />
                      {listing.daysOnMarket}d
                    </div>
                  )}
                  {listing.propertyType && (
                    <div className="absolute top-3 right-3 px-2.5 py-1 bg-[#1AAFD4]/90 text-[#1a1a1a] text-xs font-bold rounded-full">
                      {listing.propertyType}
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="p-5">
                  {/* Price */}
                  <div className="text-2xl font-bold text-[#1AAFD4] mb-1">{fmt(listing.price)}</div>

                  {/* Address */}
                  <div className="text-slate-200 font-medium mb-4 leading-snug text-sm">{listing.address}</div>

                  {/* Specs row */}
                  <div className="flex gap-4 text-slate-400 text-sm border-t border-slate-700 pt-3">
                    <div className="flex items-center gap-1.5">
                      <Bed className="w-4 h-4 text-slate-500" />
                      <span>{listing.bedrooms} bed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Bath className="w-4 h-4 text-slate-500" />
                      <span>{listing.bathrooms} bath</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Maximize className="w-4 h-4 text-slate-500" />
                      <span>{listing.sqft.toLocaleString()} sqft</span>
                    </div>
                  </div>

                  {/* Tags row */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {listing.garage && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-slate-700 rounded-full text-slate-400 text-xs">
                        <Car className="w-3 h-3" /> Garage
                      </span>
                    )}
                    {listing.pool && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-slate-700 rounded-full text-slate-400 text-xs">
                        <Waves className="w-3 h-3" /> Pool
                      </span>
                    )}
                    {listing.yearBuilt && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-slate-700 rounded-full text-slate-400 text-xs">
                        <Calendar className="w-3 h-3" /> {listing.yearBuilt}
                      </span>
                    )}
                  </div>

                  {/* View details CTA */}
                  <div className="mt-4 py-2.5 rounded-xl bg-[#1AAFD4]/10 text-[#1AAFD4] font-semibold text-sm text-center group-hover:bg-[#1AAFD4] group-hover:text-[#1a1a1a] transition-colors">
                    View Details →
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
