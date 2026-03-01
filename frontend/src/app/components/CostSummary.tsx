import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { generateCostProjections, generateLLMSummary } from '../data/mockData';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { ArrowLeft, Home as HomeIcon, TrendingUp, Wrench, DollarSign, RefreshCw } from 'lucide-react';

const fmt = (n: number) =>
  n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}K`;

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: 12,
};

export const CostSummary: React.FC = () => {
  const navigate = useNavigate();
  const { selectedNeighborhood, selectedListing } = usePreferences();
  const [streamedText, setStreamedText] = useState({ neighborhood: '', house: '', costs: '' });
  const [isStreaming, setIsStreaming] = useState(true);
  const [activeTab, setActiveTab] = useState<'future' | 'maintenance' | 'monthly'>('future');

  if (!selectedNeighborhood || !selectedListing) {
    navigate('/neighborhoods');
    return null;
  }

  const costData = generateCostProjections(selectedListing.price);
  const summary = generateLLMSummary(selectedNeighborhood, selectedListing);

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
    { label: 'Mortgage (30yr, 20% down)', value: costData.monthlyBreakdown.mortgage, color: '#10b981' },
    { label: 'Property Tax', value: costData.monthlyBreakdown.propertyTax, color: '#059669' },
    { label: 'Homeowner Insurance', value: costData.monthlyBreakdown.insurance, color: '#34d399' },
    { label: 'HOA Fees (est.)', value: costData.monthlyBreakdown.hoa, color: '#6ee7b7' },
    { label: 'Maintenance Reserve', value: costData.monthlyBreakdown.maintenance, color: '#a7f3d0' },
  ];

  useEffect(() => {
    const streamText = async () => {
      const sections = [
        { key: 'neighborhood' as const, text: summary.neighborhoodMatch },
        { key: 'house' as const, text: summary.houseFit },
        { key: 'costs' as const, text: summary.futureCosts },
      ];
      for (const section of sections) {
        const words = section.text.split(' ');
        for (let i = 0; i < words.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          setStreamedText((prev) => ({ ...prev, [section.key]: words.slice(0, i + 1).join(' ') }));
        }
      }
      setIsStreaming(false);
    };
    streamText();
  }, []);

  const cursor = (text: string, full: string) =>
    isStreaming && text.length > 0 && text.length < full.length ? '▋' : '';

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/listings')}
        className="flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors text-sm font-medium mb-6"
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
          <span className="ml-2 px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-sm font-semibold rounded-full border border-emerald-800/50">
            {selectedNeighborhood.matchScore}% match
          </span>
        </p>
      </div>

      {/* Price banner */}
      <div className="bg-emerald-600/20 border border-emerald-700/50 rounded-2xl p-6 mb-8 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-emerald-400 text-sm font-medium mb-1">Current Asking Price</div>
          <div className="text-5xl font-bold text-slate-100">{fmt(selectedListing.price)}</div>
        </div>
        <div className="h-12 w-px bg-emerald-800/50 hidden sm:block" />
        <div className="flex gap-8 flex-wrap">
          {[
            ['Bedrooms', selectedListing.bedrooms],
            ['Bathrooms', selectedListing.bathrooms],
            ['Square Feet', selectedListing.sqft.toLocaleString()],
            ['Price / sqft', `$${Math.round(selectedListing.price / selectedListing.sqft)}`],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-emerald-600 text-xs mb-1">{label}</div>
              <div className="font-bold text-lg text-slate-100">{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left: charts */}
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-700">
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
                      ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5'
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
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradWorst" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="#334155" />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#334155" tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => fmt((v ?? 0))} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                      <Area type="monotone" dataKey="Best Case" stroke="#10b981" fill="url(#gradBest)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Expected" stroke="#818cf8" fill="none" strokeWidth={2} strokeDasharray="5 3" />
                      <Area type="monotone" dataKey="Worst Case" stroke="#f87171" fill="url(#gradWorst)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-slate-600 mt-3 text-center">Placeholder — will use live market data once backend connected</p>
                </>
              )}

              {activeTab === 'maintenance' && (
                <>
                  <h3 className="font-semibold text-slate-100 mb-4">Cumulative Maintenance Costs</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={maintenanceChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="#334155" />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#334155" tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => fmt((v ?? 0))} />
                      <Bar dataKey="Maintenance" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 border-t border-slate-700 pt-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">10-Year Breakdown</p>
                    {Object.entries(costData.maintenanceCosts[3].breakdown).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-slate-400">{key}</span>
                        <span className="font-semibold text-slate-200">{fmt(val)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-700 font-bold">
                      <span className="text-slate-200">Total (10 years)</span>
                      <span className="text-emerald-400">{fmt(costData.maintenanceCosts[3].cumulative)}</span>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'monthly' && (
                <>
                  <h3 className="font-semibold text-slate-100 mb-1">Monthly Cost Breakdown</h3>
                  <div className="text-3xl font-bold text-emerald-400 mb-5">
                    ${totalMonthly.toLocaleString()}<span className="text-base text-slate-500 font-normal">/mo</span>
                  </div>
                  <div className="space-y-3">
                    {monthlyItems.map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">{item.label}</span>
                          <span className="font-semibold text-slate-200">${item.value.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
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

        {/* Right: AI summary */}
        <div className="space-y-5">
          {[
            { key: 'neighborhood' as const, label: 'Neighborhood Match', Icon: HomeIcon, text: streamedText.neighborhood, full: summary.neighborhoodMatch },
            { key: 'house' as const, label: 'Home Fit', Icon: TrendingUp, text: streamedText.house, full: summary.houseFit },
            { key: 'costs' as const, label: 'Future Costs', Icon: Wrench, text: streamedText.costs, full: summary.futureCosts },
          ].map(({ key, label, Icon, text, full }) => (
            <div key={key} className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-slate-100">{label}</h3>
                {isStreaming && text.length === 0 && key === 'neighborhood' && (
                  <div className="ml-auto flex gap-1">
                    {[0, 150, 300].map((delay) => (
                      <div key={delay} className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                {text}{cursor(text, full)}
              </p>
            </div>
          ))}

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3.5 rounded-xl border border-emerald-800/50 text-emerald-400 font-semibold hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              New Search
            </button>
            <button
              onClick={() => navigate('/listings')}
              className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold transition-colors"
            >
              Back to Listings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
