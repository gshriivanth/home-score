import React from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { mockListings } from '../data/mockData';
import { Bed, Bath, Maximize, ArrowLeft } from 'lucide-react';

export const HouseListings: React.FC = () => {
  const navigate = useNavigate();
  const { selectedNeighborhood, setSelectedListing } = usePreferences();

  if (!selectedNeighborhood) {
    navigate('/neighborhoods');
    return null;
  }

  const listings = mockListings.filter((l) => l.neighborhoodId === selectedNeighborhood.id);

  const handleSelect = (listing: (typeof mockListings)[0]) => {
    setSelectedListing(listing);
    navigate('/summary');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/neighborhoods')}
        className="flex items-center gap-2 text-slate-400 hover:text-[#1AAFD4] transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Neighborhoods
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-1">Available Homes</h1>
        <p className="text-slate-400">
          <span className="text-[#1AAFD4] font-semibold">{listings.length} listings</span> in {selectedNeighborhood.name}
          <span className="ml-2 px-2.5 py-0.5 bg-[#1AAFD4]/10 text-[#1AAFD4] text-sm font-semibold rounded-full border border-[#2E5F8F]/50">
            {selectedNeighborhood.matchScore}% match
          </span>
        </p>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🏠</div>
          <h3 className="text-xl font-semibold text-slate-300 mb-2">No listings yet</h3>
          <p className="text-slate-500">Listings for this neighborhood will appear here once connected to live data.</p>
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
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
