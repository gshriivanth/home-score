import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { getListing, type GeminiListing } from '../api';
import {
  Bed, Bath, Maximize, ArrowLeft, Loader2,
  AlertCircle, Calendar, Car, Waves, Home, Clock, DollarSign, RefreshCw, User,
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
  const { selectedNeighborhood, setSelectedListing, houseRequirements, city } = usePreferences();

  const [listing, setListing] = useState<GeminiListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!selectedNeighborhood) {
    navigate('/neighborhoods');
    return null;
  }

  const { city: parsedCity, state } = parseCityState(city);

  const fetchListing = () => {
    setLoading(true);
    setError(null);
    setListing(null);

    getListing(
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
      .then((data) => { setListing(data); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { fetchListing(); }, [selectedNeighborhood.id]);

  const handleSelect = () => {
    if (!listing) return;
    setSelectedListing({
      id: listing.id,
      neighborhoodId: listing.neighborhoodId,
      address: listing.address,
      price: listing.price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      sqft: listing.sqft,
      imageUrl: listing.imageUrl,
    });
    navigate('/summary');
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/neighborhoods')}
        className="flex items-center gap-2 text-slate-400 hover:text-[#1AAFD4] transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Neighborhoods
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-bold text-slate-100">Live Zillow Listing</h1>
          <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-full border border-blue-800/40 uppercase tracking-wide">
            Real Data
          </span>
        </div>
        <p className="text-slate-400">
          <span className="text-[#1AAFD4] font-semibold">{listings.length} listings</span> in {selectedNeighborhood.name}
          <span className="ml-2 px-2.5 py-0.5 bg-[#1AAFD4]/10 text-[#1AAFD4] text-sm font-semibold rounded-full border border-[#2E5F8F]/50">
            {selectedNeighborhood.matchScore}% match
          </span>
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">Z</span>
            </div>
          </div>
          <h3 className="text-xl font-semibold text-slate-200 mb-2">Searching Zillow…</h3>
          <p className="text-slate-500 text-sm max-w-sm">
            Gemini is scanning active listings in ZIP <span className="text-emerald-400 font-mono">{selectedNeighborhood.id}</span> that match your {houseRequirements.bedrooms}bd / {houseRequirements.bathrooms}ba requirements.
          </p>
          <div className="mt-6 flex gap-2">
            {[0, 200, 400].map((d) => (
              <div key={d} className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      ) : (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {listings.map((listing) => (
          <button
            key={listing.id}
            onClick={() => handleSelect(listing)}
            className="bg-[#3A3A3A] rounded-xl overflow-hidden border border-[#484848] hover:border-[#1AAFD4] transition-all text-left group"
          >
            <div className="aspect-[4/3] overflow-hidden bg-[#454545]">
              <img
                src={listing.imageUrl}
                alt={listing.address}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>

            <div className="p-5">
              <div className="text-2xl font-bold text-[#1AAFD4] mb-1">
                ${listing.price >= 1000000
                  ? `${(listing.price / 1000000).toFixed(2)}M`
                  : `${(listing.price / 1000).toFixed(0)}K`}
              </div>
              <div className="text-slate-200 font-medium mb-4 leading-snug">{listing.address}</div>
              <div className="flex gap-4 text-slate-400 text-sm border-t border-[#484848] pt-3">
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
                onClick={handleSelect}
                className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold transition-colors shadow-lg shadow-emerald-500/20"
              >
                Select This Home →
              </button>

              <button
                onClick={fetchListing}
                title="Find a different listing"
                className="p-3.5 rounded-xl border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
