import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePreferences } from '../context/PreferencesContext';
import type { Neighborhood } from '../context/PreferencesContext';
import { mockNeighborhoods } from '../data/mockData';
import { rankNeighborhoods } from '../api';
import type { ApiNeighborhood } from '../api';
import { ArrowLeft, MapPin, Loader2, AlertTriangle } from 'lucide-react';

// ─── Map constants ────────────────────────────────────────────────────────────

const MAP_W = 560;
const MAP_H = 360;

// Decorative map: evenly distributed marker positions used when the backend
// returns placeholder lat/lng (0, 0) for ZIP-based results.
const MARKER_POSITIONS = [
  { x: 100, y: 130 },
  { x: 250, y: 80  },
  { x: 400, y: 150 },
  { x: 170, y: 215 },
  { x: 320, y: 245 },
  { x: 460, y: 100 },
  { x: 80,  y: 270 },
  { x: 220, y: 310 },
  { x: 380, y: 285 },
  { x: 500, y: 195 },
  { x: 150, y: 175 },
  { x: 290, y: 145 },
];

// When real lat/lng are available (non-zero), map them to SVG coordinates.
const LAT_MIN = 37.7449, LAT_MAX = 37.7949;
const LNG_MIN = -122.4494, LNG_MAX = -122.3994;
const MARGIN = 30;

function getMarkerPos(n: ApiNeighborhood, index: number) {
  if (n.location.lat !== 0 || n.location.lng !== 0) {
    return {
      x: ((n.location.lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (MAP_W - MARGIN * 2) + MARGIN,
      y: ((LAT_MAX - n.location.lat) / (LAT_MAX - LAT_MIN)) * (MAP_H - MARGIN * 2) + MARGIN,
    };
  }
  return MARKER_POSITIONS[index % MARKER_POSITIONS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

export const NeighborhoodRankings: React.FC = () => {
  const navigate = useNavigate();
  const { city, rankedPriorities, setSelectedNeighborhood } = usePreferences();

  const [neighborhoods, setNeighborhoods] = useState<ApiNeighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ── Fetch from backend ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setUsingFallback(false);

      try {
        const data = await rankNeighborhoods(city || 'Irvine, CA', rankedPriorities);
        if (!cancelled) setNeighborhoods(data.neighborhoods);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        // Graceful degradation: show mock data so the app keeps running
        setNeighborhoods(mockNeighborhoods as unknown as ApiNeighborhood[]);
        setUsingFallback(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [city, rankedPriorities]);

  // ── Select handler ────────────────────────────────────────────────────────
  const handleSelect = (n: ApiNeighborhood) => {
    const neighborhood: Neighborhood = {
      id: n.id,
      name: n.name,
      matchScore: n.matchScore,
      tags: n.tags,
      location: n.location,
    };
    setSelectedNeighborhood(neighborhood);
    navigate('/listings');
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Back button */}
      <button
        onClick={() => navigate('/preferences')}
        className="flex items-center gap-2 text-gray-500 hover:text-green-700 transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home Details
      </button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Best Neighborhoods For You</h1>
        <p className="text-gray-500">
          Ranked by match score based on your priorities
          {city && <span className="text-green-600 font-medium"> · {city}</span>}
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          <p className="text-sm">Fetching Census data and scoring ZIP codes…</p>
        </div>
      )}

      {/* Error / fallback banner */}
      {!loading && error && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Backend unavailable</strong> — showing sample data.
            {' '}Start the FastAPI server and refresh to see real rankings.
            <br />
            <span className="text-amber-600 text-xs">{error}</span>
          </span>
        </div>
      )}

      {/* Results grid */}
      {!loading && neighborhoods.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Neighborhood list */}
          <div className="lg:col-span-2 space-y-3">
            {neighborhoods.map((n, index) => (
              <button
                key={n.id}
                onClick={() => handleSelect(n)}
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`w-full bg-white rounded-xl p-5 border transition-all text-left ${
                  hoveredId === n.id
                    ? 'border-green-400 shadow-md'
                    : 'border-gray-200 shadow-sm hover:border-green-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400">#{index + 1}</span>
                    <h3 className="text-base font-bold text-gray-900">{n.name}</h3>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="text-2xl font-bold text-green-600">{Math.round(n.matchScore)}%</div>
                    <div className="text-xs text-gray-400">match</div>
                  </div>
                </div>

                {/* Score bar */}
                <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${n.matchScore}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {n.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Show ZIP code for real results */}
                {!usingFallback && (
                  <div className="mt-2 text-xs text-gray-400">ZIP {n.zip ?? n.id}</div>
                )}
              </button>
            ))}
          </div>

          {/* Map */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden sticky top-24">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-600" />
                <span className="font-semibold text-gray-900 text-sm">Neighborhood Map</span>
                <span className="ml-auto text-xs text-gray-400">Click a neighborhood to see listings</span>
              </div>
              <div className="p-2">
                <svg
                  viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                  className="w-full rounded-xl"
                  style={{ background: '#f8f7f4' }}
                >
                  {/* Water */}
                  <path d="M480 0 Q560 40 560 120 L560 0 Z" fill="#bfdbfe" opacity="0.7" />
                  <path
                    d="M0 300 Q80 280 160 295 Q240 310 320 300 Q400 290 480 300 L560 295 L560 360 L0 360 Z"
                    fill="#bfdbfe"
                    opacity="0.6"
                  />
                  {/* Parks */}
                  <rect x="40"  y="40"  width="70" height="50" rx="4" fill="#bbf7d0" opacity="0.8" />
                  <rect x="380" y="60"  width="80" height="55" rx="4" fill="#bbf7d0" opacity="0.8" />
                  <rect x="200" y="190" width="55" height="45" rx="4" fill="#bbf7d0" opacity="0.8" />
                  <rect x="120" y="100" width="40" height="35" rx="3" fill="#bbf7d0" opacity="0.7" />
                  {/* City blocks */}
                  {[0, 1, 2, 3, 4].map((col) =>
                    [0, 1, 2, 3].map((row) => {
                      const bx = 50 + col * 100;
                      const by = 20 + row * 80;
                      if ((col === 0 && row === 0) || (col === 3 && row === 0) || (col === 2 && row === 2)) return null;
                      if (by + 60 > 290) return null;
                      return (
                        <rect key={`${col}-${row}`} x={bx} y={by} width="80" height="60" rx="3" fill="white" opacity="0.6" />
                      );
                    }),
                  )}
                  {/* Main roads */}
                  <line x1="0" y1="100" x2={MAP_W} y2="100" stroke="#e5e7eb" strokeWidth="5" />
                  <line x1="0" y1="180" x2={MAP_W} y2="180" stroke="#e5e7eb" strokeWidth="5" />
                  <line x1="0" y1="260" x2={MAP_W} y2="260" stroke="#d1d5db" strokeWidth="4" />
                  <line x1="140" y1="0" x2="140" y2={MAP_H} stroke="#e5e7eb" strokeWidth="5" />
                  <line x1="280" y1="0" x2="280" y2={MAP_H} stroke="#e5e7eb" strokeWidth="5" />
                  <line x1="420" y1="0" x2="420" y2={MAP_H} stroke="#e5e7eb" strokeWidth="4" />
                  {/* Secondary roads */}
                  <line x1="0"   y1="140" x2={MAP_W} y2="140" stroke="#f3f4f6" strokeWidth="2" />
                  <line x1="0"   y1="220" x2={MAP_W} y2="220" stroke="#f3f4f6" strokeWidth="2" />
                  <line x1="70"  y1="0"   x2="70"  y2={MAP_H} stroke="#f3f4f6" strokeWidth="2" />
                  <line x1="210" y1="0"   x2="210" y2={MAP_H} stroke="#f3f4f6" strokeWidth="2" />
                  <line x1="350" y1="0"   x2="350" y2={MAP_H} stroke="#f3f4f6" strokeWidth="2" />
                  <line x1="490" y1="0"   x2="490" y2={MAP_H} stroke="#f3f4f6" strokeWidth="2" />

                  {/* Neighborhood markers */}
                  {neighborhoods.map((n, index) => {
                    const { x, y } = getMarkerPos(n, index);
                    const isHovered = hoveredId === n.id;
                    const r = isHovered ? 16 : 12;
                    return (
                      <g
                        key={n.id}
                        onClick={() => handleSelect(n)}
                        onMouseEnter={() => setHoveredId(n.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        {isHovered && <circle cx={x} cy={y} r={r + 8} fill="#16a34a" opacity="0.15" />}
                        <circle cx={x} cy={y} r={r} fill={isHovered ? '#15803d' : '#16a34a'} stroke="white" strokeWidth="2.5" />
                        <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">
                          {index + 1}
                        </text>
                        <text x={x} y={y + r + 13} textAnchor="middle" fill="#374151" fontSize="9" fontWeight="600">
                          {n.name.split(' ')[0]}
                        </text>
                        <text x={x} y={y + r + 22} textAnchor="middle" fill="#16a34a" fontSize="8" fontWeight="bold">
                          {Math.round(n.matchScore)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200 inline-block" />
                  Parks
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-200 inline-block" />
                  Water
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-green-600 inline-block" />
                  Neighborhood
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state (API returned 0 results) */}
      {!loading && !error && neighborhoods.length === 0 && (
        <div className="text-center py-24 text-gray-500">
          <p className="text-lg font-medium mb-2">No neighborhoods found</p>
          <p className="text-sm">Try a different city or add more priorities.</p>
        </div>
      )}
    </div>
  );
};
