import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { Search, MapPin } from 'lucide-react';

const POPULAR_CITIES = [
  'San Francisco, CA',
  'Austin, TX',
  'New York, NY',
  'Seattle, WA',
  'Denver, CO',
  'Miami, FL',
  'Chicago, IL',
  'Boston, MA',
];

export const CityInput: React.FC = () => {
  const navigate = useNavigate();
  const { city, setCity } = usePreferences();
  const [inputValue, setInputValue] = useState(city);

  const handleContinue = () => {
    if (!inputValue.trim()) return;
    setCity(inputValue.trim());
    navigate('/priorities');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleContinue();
  };

  const handlePopularCity = (c: string) => {
    setInputValue(c);
    setCity(c);
    navigate('/priorities');
  };

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-800/50 mb-8">
            <MapPin className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />
          </div>

          <h1 className="text-5xl font-bold text-slate-100 mb-4 leading-tight">
            Find your perfect<br />
            <span className="text-emerald-500">neighborhood</span>
          </h1>
          <p className="text-xl text-slate-400 mb-12">
            Tell us where you're looking and we'll match you with the best neighborhoods for your lifestyle.
          </p>

          <div className="relative mb-4">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a city, e.g. San Francisco, CA"
              className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl pl-14 pr-6 py-5 text-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              autoFocus
            />
          </div>

          <button
            onClick={handleContinue}
            disabled={!inputValue.trim()}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 font-semibold text-lg transition-colors shadow-lg shadow-emerald-500/20 mb-12"
          >
            Get Started →
          </button>

          <div>
            <p className="text-sm font-medium text-slate-600 mb-4 uppercase tracking-wide">Popular cities</p>
            <div className="flex flex-wrap justify-center gap-3">
              {POPULAR_CITIES.map((c) => (
                <button
                  key={c}
                  onClick={() => handlePopularCity(c)}
                  className="px-4 py-2 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium hover:border-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-800/40 px-6 py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-2xl font-bold text-emerald-500 mb-1">6 Steps</div>
            <div className="text-sm text-slate-500">From city to your ideal home</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-500 mb-1">12 Factors</div>
            <div className="text-sm text-slate-500">Neighborhood scoring dimensions</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-500 mb-1">10-Year</div>
            <div className="text-sm text-slate-500">Cost & value projections</div>
          </div>
        </div>
      </div>
    </div>
  );
};
