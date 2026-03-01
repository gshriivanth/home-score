import React from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import {
  ArrowLeft, X, Shield, Lock, GraduationCap, BookOpen,
  TrendingUp, Car, Globe, Baby,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Category {
  id: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
}

const ALL_CATEGORIES: Category[] = [
  { id: 'violent_crime_rate',      label: 'Safety',              desc: 'Violent crime rates',                 Icon: Shield },
  { id: 'property_crime_rate',     label: 'Property Security',   desc: 'Theft & property crime',              Icon: Lock },
  { id: 'avg_school_rating',       label: 'Schools',             desc: 'School quality & ratings',            Icon: GraduationCap },
  { id: 'income',                  label: 'Neighborhood Wealth', desc: 'Median household income',             Icon: TrendingUp },
  { id: 'commute_time',            label: 'Commute',             desc: 'Travel time to work',                 Icon: Car },
  { id: 'pct_bachelors',           label: 'Education Level',     desc: 'Share of college-educated residents', Icon: BookOpen },
  { id: 'racial_diversity_index',  label: 'Diversity',           desc: 'Cultural & demographic mix',          Icon: Globe },
  { id: 'pct_households_children', label: 'Family Friendly',     desc: 'Households with children',            Icon: Baby },
];

// Census ACS features (at least one must be selected)
const ACS_FEATURES = new Set([
  'income',
  'commute_time',
  'pct_bachelors',
  'racial_diversity_index',
  'pct_households_children',
]);

export const PriorityRanking: React.FC = () => {
  const navigate = useNavigate();
  const { city, rankedPriorities, setRankedPriorities } = usePreferences();

  const available = ALL_CATEGORIES.filter((c) => !rankedPriorities.includes(c.id));
  const ranked = rankedPriorities.map((id) => ALL_CATEGORIES.find((c) => c.id === id)!);

  // Check if at least one ACS feature is selected
  const hasAcsFeature = rankedPriorities.some((id) => ACS_FEATURES.has(id));
  const canProceed = rankedPriorities.length > 0 && hasAcsFeature;

  const addPriority = (id: string) => setRankedPriorities([...rankedPriorities, id]);
  const removePriority = (id: string) => setRankedPriorities(rankedPriorities.filter((p) => p !== id));
  const clearAll = () => setRankedPriorities([]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-slate-400 hover:text-[#1AAFD4] transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 mb-1">What matters most to you?</h1>
          <p className="text-slate-400 text-sm">
            Select and rank the factors that matter most — your #1 pick carries the most weight.
            {city && <span className="ml-1 text-[#1AAFD4] font-medium">Searching in {city}.</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => navigate('/preferences')}
            disabled={!canProceed}
            className="px-7 py-2.5 rounded-lg bg-[#1AAFD4] hover:bg-[#1788B2] disabled:bg-[#3A3A3A] disabled:text-slate-600 text-[#1a1a1a] font-semibold text-sm transition-colors whitespace-nowrap"
          >
            Next: Home Details →
          </button>
          {rankedPriorities.length > 0 && !hasAcsFeature && (
            <p className="text-xs text-amber-400">
              Select at least one Census feature: Wealth, Commute, Education, Diversity, or Family Friendly
            </p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: available categories */}
        <div className="lg:col-span-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Select to rank
          </p>
          {available.length === 0 ? (
            <div className="flex items-center justify-center h-40 rounded-xl border border-dashed border-[#484848] text-slate-500 text-sm">
              All categories ranked
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {available.map((cat) => {
                const Icon = cat.Icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => addPriority(cat.id)}
                    className="flex items-center gap-4 px-5 py-5 bg-[#3A3A3A] rounded-xl border border-[#484848] hover:border-[#1AAFD4]/60 hover:bg-[#3A3A3A]/80 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#454545] flex items-center justify-center shrink-0 group-hover:bg-[#1AAFD4]/10 transition-colors">
                      <Icon className="w-5 h-5 text-slate-400 group-hover:text-[#1AAFD4] transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-200 group-hover:text-slate-100">{cat.label}</div>
                      <div className="text-xs text-slate-500 truncate">{cat.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: ranked list */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Your ranking
            </p>
            {ranked.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors font-medium"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="bg-[#3A3A3A] rounded-xl border border-[#484848] overflow-hidden">
            {ranked.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center px-6">
                <p className="text-slate-500 text-sm">Select categories on the left to build your ranking</p>
              </div>
            ) : (
              <div>
                {ranked.map((cat, index) => {
                  const Icon = cat.Icon;
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center gap-3 px-4 py-3.5 border-b border-[#484848]/60 last:border-b-0 hover:bg-red-500/5 transition-colors group cursor-pointer"
                      onClick={() => removePriority(cat.id)}
                    >
                      <span className="w-6 text-center text-xs font-bold text-[#1AAFD4] shrink-0">
                        {index + 1}
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-[#454545] flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-100">{cat.label}</div>
                        <div className="text-xs text-slate-500 truncate">{cat.desc}</div>
                      </div>
                      <X className="w-3.5 h-3.5 text-slate-600 group-hover:text-red-400 transition-colors shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {ranked.length > 0 && (
            <p className="text-xs text-slate-600 text-center mt-2">
              Click any item to remove it
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 lg:hidden">
        <button
          onClick={() => navigate('/preferences')}
          disabled={rankedPriorities.length === 0}
          className="w-full py-3.5 rounded-xl bg-[#1AAFD4] hover:bg-[#1788B2] disabled:bg-[#3A3A3A] disabled:text-slate-600 text-[#1a1a1a] font-semibold transition-colors"
        >
          Next: Home Details →
        </button>
      </div>
    </div>
  );
};
