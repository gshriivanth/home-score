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
      {/* Back + header */}
      <button
        onClick={() => navigate('/neighborhoods')}
        className="flex items-center gap-2 text-gray-500 hover:text-green-700 transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Neighborhoods
      </button>

      <div className="mb-8 flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Available Homes</h1>
          <p className="text-gray-500">
            <span className="text-green-600 font-semibold">{listings.length} listings</span> in {selectedNeighborhood.name}
            <span className="ml-2 px-2.5 py-0.5 bg-green-50 text-green-700 text-sm font-semibold rounded-full border border-green-100">
              {selectedNeighborhood.matchScore}% match
            </span>
          </p>
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🏠</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No listings yet</h3>
          <p className="text-gray-400">Listings for this neighborhood will appear here once connected to live data.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing) => (
            <button
              key={listing.id}
              onClick={() => handleSelect(listing)}
              className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:border-green-400 hover:shadow-md transition-all text-left group"
            >
              {/* Image */}
              <div className="aspect-[4/3] overflow-hidden bg-gray-100">
                <img
                  src={listing.imageUrl}
                  alt={listing.address}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              {/* Content */}
              <div className="p-5">
                {/* Price */}
                <div className="text-2xl font-bold text-green-600 mb-1">
                  ${listing.price >= 1000000
                    ? `${(listing.price / 1000000).toFixed(2)}M`
                    : `${(listing.price / 1000).toFixed(0)}K`}
                </div>

                {/* Address */}
                <div className="text-gray-800 font-medium mb-4 leading-snug">{listing.address}</div>

                {/* Stats */}
                <div className="flex gap-4 text-gray-500 text-sm border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-1.5">
                    <Bed className="w-4 h-4 text-gray-400" />
                    <span>{listing.bedrooms} bed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Bath className="w-4 h-4 text-gray-400" />
                    <span>{listing.bathrooms} bath</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Maximize className="w-4 h-4 text-gray-400" />
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
