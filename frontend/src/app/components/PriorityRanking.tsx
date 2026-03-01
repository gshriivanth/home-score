import React from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { ArrowLeft, X } from 'lucide-react';

const ALL_CATEGORIES = [
  { id: 'safety', label: 'Safety', emoji: '🛡️', desc: 'Crime rates & security' },
  { id: 'education', label: 'Education', emoji: '📚', desc: 'School quality & ratings' },
  { id: 'diversity', label: 'Diversity', emoji: '🌍', desc: 'Cultural & demographic mix' },
  { id: 'commute', label: 'Commute', emoji: '🚗', desc: 'Travel time & traffic' },
  { id: 'walkability', label: 'Walkability', emoji: '🚶', desc: 'Walk score & daily errands' },
  { id: 'transit', label: 'Public Transit', emoji: '🚌', desc: 'Bus, metro & rail access' },
  { id: 'greenspace', label: 'Green Space', emoji: '🌳', desc: 'Parks & outdoor areas' },
  { id: 'family', label: 'Family Friendly', emoji: '👨‍👩‍👧', desc: 'Kid-safe activities & schools' },
  { id: 'nightlife', label: 'Nightlife', emoji: '🌙', desc: 'Entertainment & bars' },
  { id: 'dining', label: 'Dining & Shops', emoji: '🍽️', desc: 'Restaurants & retail' },
  { id: 'quiet', label: 'Quiet & Peaceful', emoji: '🤫', desc: 'Low noise & calm streets' },
  { id: 'community', label: 'Community', emoji: '🤝', desc: 'Events & neighborhood vibe' },
];

export const PriorityRanking: React.FC = () => {
  const navigate = useNavigate();
  const { city, rankedPriorities, setRankedPriorities } = usePreferences();

  const available = ALL_CATEGORIES.filter((c) => !rankedPriorities.includes(c.id));
  const ranked = rankedPriorities.map((id) => ALL_CATEGORIES.find((c) => c.id === id)!);

  const addPriority = (id: string) => {
    setRankedPriorities([...rankedPriorities, id]);
  };

  const removePriority = (id: string) => {
    setRankedPriorities(rankedPriorities.filter((p) => p !== id));
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Back + header */}
      <div className="mb-2">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-500 hover:text-green-700 transition-colors text-sm font-medium mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              What matters most to you?
            </h1>
            <p className="text-gray-500">
              Click categories to rank them by importance — #1 is your top priority.
              {city && <span className="ml-1 text-green-600 font-medium">Searching in {city}.</span>}
            </p>
          </div>
          <button
            onClick={() => navigate('/preferences')}
            disabled={rankedPriorities.length === 0}
            className="px-8 py-3 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold transition-colors shadow-sm whitespace-nowrap"
          >
            Next: Home Details →
          </button>
        </div>
      </div>

      <div className="mt-8 grid lg:grid-cols-5 gap-8">
        {/* Left: Available categories */}
        <div className="lg:col-span-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Available categories — click to add
          </h2>
          {available.length === 0 ? (
            <div className="flex items-center justify-center h-48 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
              All categories ranked! ✓
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {available.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => addPriority(cat.id)}
                  className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-green-400 hover:bg-green-50 hover:shadow-sm transition-all text-left group"
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 group-hover:text-green-800">{cat.label}</div>
                    <div className="text-xs text-gray-500 truncate">{cat.desc}</div>
                  </div>
                  <span className="text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    + Add
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Ranked priorities */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Your priorities — click to remove
          </h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm min-h-48">
            {ranked.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                <div className="text-3xl mb-3">👆</div>
                <p className="text-gray-400 text-sm">Click a category on the left to start ranking</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {ranked.map((cat, index) => (
                  <div
                    key={cat.id}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-red-50 transition-colors group cursor-pointer"
                    onClick={() => removePriority(cat.id)}
                  >
                    {/* Rank badge */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 text-white text-sm font-bold flex items-center justify-center">
                      {index + 1}
                    </div>
                    <span className="text-xl">{cat.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{cat.label}</div>
                      <div className="text-xs text-gray-400 truncate">{cat.desc}</div>
                    </div>
                    <X className="w-4 h-4 text-gray-300 group-hover:text-red-400 transition-colors flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {ranked.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-3">
              {ranked.length} {ranked.length === 1 ? 'priority' : 'priorities'} selected · click any to remove
            </p>
          )}
        </div>
      </div>

      {/* Mobile CTA */}
      <div className="mt-8 lg:hidden">
        <button
          onClick={() => navigate('/preferences')}
          disabled={rankedPriorities.length === 0}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold text-lg transition-colors"
        >
          Next: Home Details →
        </button>
      </div>
    </div>
  );
};
