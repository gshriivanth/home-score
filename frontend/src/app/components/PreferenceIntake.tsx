import React from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import type { HouseRequirements } from '../context/PreferencesContext';
import { ArrowLeft } from 'lucide-react';

function ButtonGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-emerald-500 text-slate-900'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-slate-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export const PreferenceIntake: React.FC = () => {
  const navigate = useNavigate();
  const { houseRequirements, setHouseRequirements } = usePreferences();

  const update = (updates: Partial<HouseRequirements>) =>
    setHouseRequirements({ ...houseRequirements, ...updates });

  const inputClass =
    'w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/priorities')}
        className="flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Priorities
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-2">What are you looking for in a home?</h1>
        <p className="text-slate-400">Tell us about your ideal home so we can find the best matches.</p>
      </div>

      <div className="space-y-5">
        {/* The Basics */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100 mb-5">The Basics</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Bedrooms</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => update({ bedrooms: n })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      houseRequirements.bedrooms === n
                        ? 'bg-emerald-500 text-slate-900'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {n === 5 ? '5+' : n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Bathrooms</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => update({ bathrooms: n })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      houseRequirements.bathrooms === n
                        ? 'bg-emerald-500 text-slate-900'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {n === 4 ? '4+' : n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Property Type</label>
              <ButtonGroup
                options={[
                  { value: 'any' as const, label: 'Any' },
                  { value: 'single-family' as const, label: 'Single Family' },
                  { value: 'townhouse' as const, label: 'Townhouse' },
                  { value: 'condo' as const, label: 'Condo' },
                ]}
                value={houseRequirements.propertyType}
                onChange={(v) => update({ propertyType: v })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Stories</label>
              <ButtonGroup
                options={[
                  { value: 0, label: 'Any' },
                  { value: 1, label: '1 Story' },
                  { value: 2, label: '2 Stories' },
                  { value: 3, label: '3+ Stories' },
                ]}
                value={houseRequirements.stories}
                onChange={(v) => update({ stories: v })}
              />
            </div>
          </div>
        </div>

        {/* Budget */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100 mb-5">Your Budget</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Minimum Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <input
                  type="number"
                  value={houseRequirements.minPrice}
                  onChange={(e) => update({ minPrice: parseInt(e.target.value) || 0 })}
                  className={`${inputClass} pl-8`}
                  step={10000}
                  min={0}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Maximum Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <input
                  type="number"
                  value={houseRequirements.maxPrice}
                  onChange={(e) => update({ maxPrice: parseInt(e.target.value) || 0 })}
                  className={`${inputClass} pl-8`}
                  step={10000}
                  min={0}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Size & Lot */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100 mb-5">Size & Lot</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Min Interior Size</label>
              <div className="relative">
                <input
                  type="number"
                  value={houseRequirements.sqftMin}
                  onChange={(e) => update({ sqftMin: parseInt(e.target.value) || 0 })}
                  className={`${inputClass} pr-16`}
                  step={100}
                  min={0}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">sqft</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Max Interior Size</label>
              <div className="relative">
                <input
                  type="number"
                  value={houseRequirements.sqftMax}
                  onChange={(e) => update({ sqftMax: parseInt(e.target.value) || 0 })}
                  className={`${inputClass} pr-16`}
                  step={100}
                  min={0}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">sqft</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-3">Lot Size</label>
              <ButtonGroup
                options={[
                  { value: 'any' as const, label: 'No Preference' },
                  { value: 'small' as const, label: 'Small (< 5,000 sqft)' },
                  { value: 'medium' as const, label: 'Medium (5–15K sqft)' },
                  { value: 'large' as const, label: 'Large (15K+ sqft)' },
                ]}
                value={houseRequirements.lotSize}
                onChange={(v) => update({ lotSize: v })}
              />
            </div>
          </div>
        </div>

        {/* Features & Age */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100 mb-5">Features & Age</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Garage</label>
              <div className="flex gap-2">
                <button
                  onClick={() => update({ garage: false })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    !houseRequirements.garage ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Not needed
                </button>
                <button
                  onClick={() => update({ garage: true })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    houseRequirements.garage ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Required
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Pool</label>
              <div className="flex gap-2">
                <button
                  onClick={() => update({ pool: false })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    !houseRequirements.pool ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Not needed
                </button>
                <button
                  onClick={() => update({ pool: true })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    houseRequirements.pool ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Required
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Year Built</label>
              <ButtonGroup
                options={[
                  { value: 'any' as const, label: 'Any' },
                  { value: 'pre-1990' as const, label: 'Before 1990' },
                  { value: '1990-2010' as const, label: '1990–2010' },
                  { value: '2010-2020' as const, label: '2010–2020' },
                  { value: '2020+' as const, label: '2020+' },
                ]}
                value={houseRequirements.yearBuilt}
                onChange={(v) => update({ yearBuilt: v })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={() => navigate('/neighborhoods')}
          className="px-10 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold text-base transition-colors"
        >
          Find My Neighborhoods →
        </button>
      </div>
    </div>
  );
};
