import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { generateSummary } from '../api';
import { generateCostProjections } from '../data/mockData';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import {
  ArrowLeft, Home as HomeIcon, TrendingUp, Wrench, DollarSign, RefreshCw,
  Sparkles, AlertCircle,
} from 'lucide-react';

const fmt = (n: number) =>
  n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}K`;

const tooltipStyle = {
  backgroundColor: '#3A3A3A',
  border: '1px solid #484848',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: 12,
};

// ── Skeleton lines for the loading state ─────────────────────────────────────

const SkeletonLine: React.FC<{ width?: string }> = ({ width = 'w-full' }) => (
  <div className={`h-3 rounded-full bg-[#484848] animate-pulse ${width}`} />
);

const SummarySkeletonBlock: React.FC = () => (
  <div className="space-y-3">
    <SkeletonLine />
    <SkeletonLine width="w-11/12" />
    <SkeletonLine width="w-4/5" />
    <div className="pt-1" />
    <SkeletonLine />
    <SkeletonLine width="w-10/12" />
    <SkeletonLine width="w-3/4" />
    <div className="pt-1" />
    <SkeletonLine />
    <SkeletonLine width="w-11/12" />
    <SkeletonLine width="w-5/6" />
    <div className="pt-1" />
    <SkeletonLine />
    <SkeletonLine width="w-9/12" />
  </div>
);

// ── Streaming text display ────────────────────────────────────────────────────

function useWordStream(fullText: string, active: boolean) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active || !fullText) return;
    setDisplayed('');
    setDone(false);
    indexRef.current = 0;

    const words = fullText.split(' ');

    const tick = () => {
      if (indexRef.current >= words.length) {
        setDone(true);
        return;
      }
      setDisplayed(words.slice(0, indexRef.current + 1).join(' '));
      indexRef.current += 1;
      setTimeout(tick, 18);
    };

    tick();
  }, [fullText, active]);

  return { displayed, done };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CostSummary: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedNeighborhood,
    selectedListing,
    appreciationData,
    rankedPriorities,
    houseRequirements,
    city,
  } = usePreferences();

  const [activeTab, setActiveTab] = useState<'future' | 'maintenance' | 'monthly'>('future');
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [streamActive, setStreamActive] = useState(false);

  if (!selectedNeighborhood || !selectedListing) {
    navigate('/neighborhoods');
    return null;
  }

  const costData = generateCostProjections(selectedListing.price);

  const futurePriceChart = costData.futurePrices.map((d) => ({
    year: `Year ${d.year}`,
    'Best Case': d.best,
    Expected: d.expected,
    'Worst Case': d.worst,
  }));

  const maintenanceChart = costData.maintenanceCosts.map((d) => ({
    year: `Year ${d.year}`,
    Maintenance: d.cumulative,
  }));

  const totalMonthly =
    costData.monthlyBreakdown.mortgage +
    costData.monthlyBreakdown.propertyTax +
    costData.monthlyBreakdown.insurance +
    costData.monthlyBreakdown.hoa +
    costData.monthlyBreakdown.maintenance;

  const monthlyItems = [
    { label: 'Mortgage (30yr, 20% down)', value: costData.monthlyBreakdown.mortgage, color: '#1AAFD4' },
    { label: 'Property Tax', value: costData.monthlyBreakdown.propertyTax, color: '#1788B2' },
    { label: 'Homeowner Insurance', value: costData.monthlyBreakdown.insurance, color: '#6EC1E4' },
    { label: 'HOA Fees (est.)', value: costData.monthlyBreakdown.hoa, color: '#2E5F8F' },
    { label: 'Maintenance Reserve', value: costData.monthlyBreakdown.maintenance, color: '#1F3F63' },
  ];

  // Parse city/state for the API call
  function parseCityState(input: string): { city: string; state: string } {
    const m = input.trim().match(/^(.+),\s*([A-Za-z]{2})$/);
    if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
    return { city: input.trim(), state: 'CA' };
  }
  const { city: parsedCity, state } = parseCityState(city);

  // Fetch Gemini summary on mount
  useEffect(() => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryText('');
    setStreamActive(false);

    generateSummary({
      city: parsedCity,
      state,
      ranked_priorities: rankedPriorities,
      house_requirements: houseRequirements as unknown as Record<string, unknown>,

      neighborhood_name: selectedNeighborhood.name,
      neighborhood_match_score: selectedNeighborhood.matchScore,
      neighborhood_zip: selectedNeighborhood.id,
      neighborhood_tags: selectedNeighborhood.tags,
      neighborhood_features: selectedNeighborhood.features,

      listing_address: selectedListing.address,
      listing_price: selectedListing.price,
      listing_bedrooms: selectedListing.bedrooms,
      listing_bathrooms: selectedListing.bathrooms,
      listing_sqft: selectedListing.sqft,
      listing_year_built: selectedListing.yearBuilt,
      listing_property_type: selectedListing.propertyType,
      listing_garage: selectedListing.garage,
      listing_pool: selectedListing.pool,
      listing_stories: selectedListing.stories,
      listing_lot_size_sqft: selectedListing.lotSizeSqft,
      listing_hoa_monthly: selectedListing.hoaMonthly,
      listing_days_on_market: selectedListing.daysOnMarket,
      listing_price_per_sqft: selectedListing.pricePerSqft,
      listing_description: selectedListing.description,

      appreciation_projections: appreciationData ?? undefined,

      monthly_mortgage: costData.monthlyBreakdown.mortgage,
      monthly_property_tax: costData.monthlyBreakdown.propertyTax,
      monthly_insurance: costData.monthlyBreakdown.insurance,
      monthly_hoa: costData.monthlyBreakdown.hoa,
      monthly_maintenance: costData.monthlyBreakdown.maintenance,
    })
      .then((text) => {
        setSummaryText(text);
        setSummaryLoading(false);
        setStreamActive(true);
      })
      .catch((err: Error) => {
        setSummaryError(err.message);
        setSummaryLoading(false);
      });
  }, []);

  const { displayed: streamedSummary, done: streamDone } = useWordStream(summaryText, streamActive);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/listings')}
        className="flex items-center gap-2 text-slate-400 hover:text-[#1AAFD4] transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Listings
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-1">Your Home Analysis</h1>
        <p className="text-slate-400">
          {selectedListing.address}
          <span className="mx-2 text-slate-600">·</span>
          {selectedNeighborhood.name}
          <span className="ml-2 px-2.5 py-0.5 bg-[#1AAFD4]/10 text-[#1AAFD4] text-sm font-semibold rounded-full border border-[#2E5F8F]/50">
            {selectedNeighborhood.matchScore}% match
          </span>
        </p>
      </div>

      {/* Price banner */}
      <div className="bg-[#1788B2]/20 border border-[#1788B2]/50 rounded-xl p-6 mb-8 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-[#1AAFD4] text-sm font-medium mb-1">Current Asking Price</div>
          <div className="text-5xl font-bold text-slate-100">{fmt(selectedListing.price)}</div>
        </div>
        <div className="h-12 w-px bg-[#2E5F8F]/50 hidden sm:block" />
        <div className="flex gap-8 flex-wrap">
          {[
            ['Bedrooms', selectedListing.bedrooms],
            ['Bathrooms', selectedListing.bathrooms],
            ['Square Feet', selectedListing.sqft.toLocaleString()],
            ['Price / sqft', `$${Math.round(selectedListing.price / selectedListing.sqft)}`],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-[#1788B2] text-xs mb-1">{label}</div>
              <div className="font-bold text-lg text-slate-100">{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left: charts */}
        <div className="space-y-6">
          <div className="bg-[#3A3A3A] rounded-xl border border-[#484848] overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-[#484848]">
              {([
                ['future', 'Future Value', TrendingUp],
                ['maintenance', 'Maintenance', Wrench],
                ['monthly', 'Monthly Costs', DollarSign],
              ] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-[#1AAFD4] border-b-2 border-[#1AAFD4] bg-[#1AAFD4]/5'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'future' && (
                <>
                  <h3 className="font-semibold text-slate-100 mb-4">Home Value Projection</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={futurePriceChart}>
                      <defs>
                        <linearGradient id="gradBest" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1AAFD4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#1AAFD4" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradWorst" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#484848" />
                      <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="#484848" />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#484848" tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => fmt((v ?? 0))} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                      <Area type="monotone" dataKey="Best Case" stroke="#1AAFD4" fill="url(#gradBest)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Expected" stroke="#818cf8" fill="none" strokeWidth={2} strokeDasharray="5 3" />
                      <Area type="monotone" dataKey="Worst Case" stroke="#f87171" fill="url(#gradWorst)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              )}

              {activeTab === 'maintenance' && (
                <>
                  <h3 className="font-semibold text-slate-100 mb-4">Cumulative Maintenance Costs</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={maintenanceChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#484848" />
                      <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="#484848" />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#484848" tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => fmt((v ?? 0))} />
                      <Bar dataKey="Maintenance" fill="#1AAFD4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 border-t border-[#484848] pt-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">10-Year Breakdown</p>
                    {Object.entries(costData.maintenanceCosts[3].breakdown).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-slate-400">{key}</span>
                        <span className="font-semibold text-slate-200">{fmt(val)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm pt-2 border-t border-[#484848] font-bold">
                      <span className="text-slate-200">Total (10 years)</span>
                      <span className="text-[#1AAFD4]">{fmt(costData.maintenanceCosts[3].cumulative)}</span>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'monthly' && (
                <>
                  <h3 className="font-semibold text-slate-100 mb-1">Monthly Cost Breakdown</h3>
                  <div className="text-3xl font-bold text-[#1AAFD4] mb-5">
                    ${totalMonthly.toLocaleString()}<span className="text-base text-slate-500 font-normal">/mo</span>
                  </div>
                  <div className="space-y-3">
                    {monthlyItems.map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">{item.label}</span>
                          <span className="font-semibold text-slate-200">${item.value.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-[#484848] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(item.value / totalMonthly) * 100}%`, backgroundColor: item.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 mt-4 text-center">
                    Assumes 20% down at 7% interest · Actual rates may vary
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Gemini AI Analysis */}
        <div className="flex flex-col gap-5">
          {/* AI Analysis card */}
          <div className="flex-1 bg-[#2B2B2B] rounded-xl border border-[#484848] overflow-hidden flex flex-col"
               style={{ minHeight: 420 }}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#484848] flex items-center gap-3"
                 style={{ background: 'linear-gradient(135deg, rgba(26,175,212,0.08) 0%, rgba(26,175,212,0.02) 100%)' }}>
              <div className="w-8 h-8 rounded-lg bg-[#1AAFD4]/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-[#1AAFD4]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-100 text-sm leading-none mb-0.5">AI Analysis</h3>
                <p className="text-slate-500 text-xs">Personalized explanation of your recommendation</p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1AAFD4]/10 border border-[#1AAFD4]/20 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-[#1AAFD4] animate-pulse" />
                <span className="text-[#1AAFD4] text-xs font-medium">AI</span>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 p-5 overflow-y-auto">
              {summaryLoading && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex gap-1">
                      {[0, 150, 300].map((d) => (
                        <div
                          key={d}
                          className="w-1.5 h-1.5 rounded-full bg-[#1AAFD4] animate-bounce"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-slate-500 text-xs">Analyzing your data...</span>
                  </div>
                  <SummarySkeletonBlock />
                </div>
              )}

              {summaryError && !summaryLoading && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
                  <AlertCircle className="w-8 h-8 text-red-400/70" />
                  <div>
                    <p className="text-slate-400 text-sm font-medium mb-1">Could not generate analysis</p>
                    <p className="text-slate-600 text-xs font-mono">{summaryError}</p>
                  </div>
                </div>
              )}

              {!summaryLoading && !summaryError && (
                <div className="text-slate-300 text-sm leading-relaxed space-y-4">
                  {(streamActive ? streamedSummary : summaryText)
                    .split('\n\n')
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  {streamActive && !streamDone && (
                    <span className="inline-block w-0.5 h-4 bg-[#1AAFD4] animate-pulse align-middle ml-0.5" />
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {!summaryLoading && !summaryError && (
              <div className="px-5 py-3 border-t border-[#484848] flex items-center justify-between">
                <span className="text-slate-600 text-xs">
                  Based on Census ACS · FBI CDE · FRED · XGBoost ML
                </span>
                <HomeIcon className="w-3.5 h-3.5 text-slate-600" />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3.5 rounded-lg border border-[#2E5F8F]/50 text-[#1AAFD4] font-semibold hover:bg-[#1AAFD4]/10 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              New Search
            </button>
            <button
              onClick={() => navigate('/listings')}
              className="flex-1 py-3.5 rounded-lg bg-[#1AAFD4] hover:bg-[#1788B2] text-[#1a1a1a] font-semibold transition-colors"
            >
              Back to Listings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
