import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import { generateCostProjections, generateLLMSummary } from '../data/mockData';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { ArrowLeft, Home as HomeIcon, TrendingUp, Wrench, DollarSign, RefreshCw } from 'lucide-react';

const fmt = (n: number) =>
  n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}K`;

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
    { label: 'Mortgage (30yr, 20% down)', value: costData.monthlyBreakdown.mortgage, color: '#16a34a' },
    { label: 'Property Tax', value: costData.monthlyBreakdown.propertyTax, color: '#15803d' },
    { label: 'Homeowner Insurance', value: costData.monthlyBreakdown.insurance, color: '#22c55e' },
    { label: 'HOA Fees (est.)', value: costData.monthlyBreakdown.hoa, color: '#4ade80' },
    { label: 'Maintenance Reserve', value: costData.monthlyBreakdown.maintenance, color: '#86efac' },
  ];

  // Simulate streaming text
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
      {/* Back + header */}
      <button
        onClick={() => navigate('/listings')}
        className="flex items-center gap-2 text-gray-500 hover:text-green-700 transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Listings
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Your Home Analysis</h1>
        <p className="text-gray-500">
          {selectedListing.address}
          <span className="mx-2 text-gray-300">·</span>
          {selectedNeighborhood.name}
          <span className="ml-2 px-2.5 py-0.5 bg-green-50 text-green-700 text-sm font-semibold rounded-full border border-green-100">
            {selectedNeighborhood.matchScore}% match
          </span>
        </p>
      </div>

      {/* Current price banner */}
      <div className="bg-green-600 rounded-2xl p-6 mb-8 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-green-200 text-sm font-medium mb-1">Current Asking Price</div>
          <div className="text-5xl font-bold text-white">{fmt(selectedListing.price)}</div>
        </div>
        <div className="h-12 w-px bg-green-500 hidden sm:block" />
        <div className="flex gap-8 text-white flex-wrap">
          <div>
            <div className="text-green-200 text-xs mb-1">Bedrooms</div>
            <div className="font-bold text-lg">{selectedListing.bedrooms}</div>
          </div>
          <div>
            <div className="text-green-200 text-xs mb-1">Bathrooms</div>
            <div className="font-bold text-lg">{selectedListing.bathrooms}</div>
          </div>
          <div>
            <div className="text-green-200 text-xs mb-1">Square Feet</div>
            <div className="font-bold text-lg">{selectedListing.sqft.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-green-200 text-xs mb-1">Price per sqft</div>
            <div className="font-bold text-lg">${Math.round(selectedListing.price / selectedListing.sqft)}</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left: charts */}
        <div className="space-y-6">
          {/* Chart tabs */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
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
                      ? 'text-green-700 border-b-2 border-green-600 bg-green-50'
                      : 'text-gray-500 hover:text-gray-700'
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
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Home Value Projection — Best, Expected & Worst Case
                  </h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={futurePriceChart}>
                      <defs>
                        <linearGradient id="gradBest" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradWorst" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="#d1d5db" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#d1d5db" tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                        formatter={(v: number) => fmt(v)}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="Best Case" stroke="#16a34a" fill="url(#gradBest)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Expected" stroke="#6366f1" fill="none" strokeWidth={2} strokeDasharray="5 3" />
                      <Area type="monotone" dataKey="Worst Case" stroke="#ef4444" fill="url(#gradWorst)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-3 text-center">
                    Placeholder projections — will reflect real market data once backend is connected
                  </p>
                </>
              )}

              {activeTab === 'maintenance' && (
                <>
                  <h3 className="font-semibold text-gray-900 mb-4">Cumulative Maintenance Costs Over Time</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={maintenanceChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="#d1d5db" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#d1d5db" tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                        formatter={(v: number) => fmt(v)}
                      />
                      <Bar dataKey="Maintenance" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Breakdown table for year 10 */}
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">10-Year Breakdown</p>
                    <div className="space-y-2">
                      {Object.entries(costData.maintenanceCosts[3].breakdown).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-gray-600">{key}</span>
                          <span className="font-semibold text-gray-900">{fmt(val)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-100 font-bold">
                        <span className="text-gray-900">Total (10 years)</span>
                        <span className="text-green-600">{fmt(costData.maintenanceCosts[3].cumulative)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'monthly' && (
                <>
                  <h3 className="font-semibold text-gray-900 mb-1">Monthly Cost Breakdown</h3>
                  <div className="text-3xl font-bold text-green-600 mb-5">
                    ${totalMonthly.toLocaleString()}<span className="text-base text-gray-400 font-normal">/mo</span>
                  </div>
                  <div className="space-y-3">
                    {monthlyItems.map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{item.label}</span>
                          <span className="font-semibold text-gray-900">${item.value.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(item.value / totalMonthly) * 100}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-4 text-center">
                    Assumes 20% down payment at 7% interest rate · Actual rates may vary
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: AI summary */}
        <div className="space-y-5">
          {/* Neighborhood match */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                <HomeIcon className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Neighborhood Match</h3>
              {isStreaming && streamedText.neighborhood.length === 0 && (
                <div className="ml-auto flex gap-1">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              {streamedText.neighborhood}{cursor(streamedText.neighborhood, summary.neighborhoodMatch)}
            </p>
          </div>

          {/* House fit */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Home Fit</h3>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              {streamedText.house}{cursor(streamedText.house, summary.houseFit)}
            </p>
          </div>

          {/* Future costs */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Future Costs</h3>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              {streamedText.costs}{cursor(streamedText.costs, summary.futureCosts)}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3.5 rounded-xl border-2 border-green-200 text-green-700 font-semibold hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              New Search
            </button>
            <button
              onClick={() => navigate('/listings')}
              className="flex-1 py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors"
            >
              Back to Listings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
