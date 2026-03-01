import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { usePreferences } from '../context/PreferencesContext';
import type { Neighborhood } from '../context/PreferencesContext';
import { mockNeighborhoods } from '../data/mockData';
import { rankNeighborhoods } from '../api';
import type { ApiNeighborhood } from '../api';
import { ArrowLeft, MapPin, Loader2, AlertTriangle } from 'lucide-react';

// ─── Leaflet marker icons ──────────────────────────────────────────────────────

function makeIcon(rank: number, hovered: boolean) {
  const bg = hovered ? '#1788B2' : '#1AAFD4';
  const size = hovered ? 36 : 30;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${bg}" stroke="#2B2B2B" stroke-width="2"/>
      <text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" fill="#1a1a1a"
        font-size="${size < 34 ? 11 : 13}" font-weight="700" font-family="Inter,sans-serif">${rank}</text>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

// ─── Recenter map when city geocode resolves ───────────────────────────────────

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

// ─── Geocode city name → lat/lng via Nominatim (free, no key) ────────────────

async function geocodeCity(city: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } },
    );
    const data = await res.json() as { lat: string; lon: string }[];
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {
    // ignore
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194]; // SF fallback
const DEFAULT_ZOOM = 12;

export const NeighborhoodRankings: React.FC = () => {
  const navigate = useNavigate();
  const { city, rankedPriorities, setSelectedNeighborhood } = usePreferences();

  const [neighborhoods, setNeighborhoods] = useState<ApiNeighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  // Geocode the city to center the map
  useEffect(() => {
    if (!city) return;
    geocodeCity(city).then((coords) => {
      if (coords) {
        setMapCenter(coords);
        setMapZoom(12);
      }
    });
  }, [city]);

  // Fetch ranked neighborhoods from backend
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setUsingFallback(false);

      try {
        const data = await rankNeighborhoods(city || 'Irvine, CA', rankedPriorities);
        if (!cancelled) {
          setNeighborhoods(data.neighborhoods);
          const top = data.neighborhoods[0];
          if (top?.location.lat !== 0 || top?.location.lng !== 0) {
            setMapCenter([top.location.lat, top.location.lng]);
            setMapZoom(13);
          }
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setNeighborhoods(mockNeighborhoods as unknown as ApiNeighborhood[]);
        setUsingFallback(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [city, rankedPriorities]);

  const handleSelect = (n: ApiNeighborhood) => {
    const neighborhood: Neighborhood = {
      id: n.id, name: n.name, matchScore: n.matchScore,
      tags: n.tags, location: n.location,
      features: n.features,
    };
    setSelectedNeighborhood(neighborhood);
    navigate('/listings');
  };

  const markersWithCoords = neighborhoods.map((n, i) => {
    const hasReal = n.location.lat !== 0 || n.location.lng !== 0;
    const lat = hasReal ? n.location.lat : mapCenter[0] + (i % 3 - 1) * 0.02 + Math.floor(i / 3) * 0.015;
    const lng = hasReal ? n.location.lng : mapCenter[1] + (i % 3 - 1) * 0.025;
    return { ...n, lat, lng };
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/preferences')}
        className="flex items-center gap-2 text-slate-400 hover:text-[#1AAFD4] transition-colors text-sm font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home Details
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-1">Best Neighborhoods For You</h1>
        <p className="text-slate-400">
          Ranked by match score based on your priorities
          {city && <span className="text-[#1AAFD4] font-medium"> · {city}</span>}
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-[#1AAFD4]" />
          <p className="text-sm">Fetching Census data and scoring ZIP codes…</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-6 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Backend unavailable</strong> — showing sample data.
            {' '}Start the FastAPI server and refresh to see real rankings.
            <br />
            <span className="text-amber-600 text-xs">{error}</span>
          </span>
        </div>
      )}

      {!loading && neighborhoods.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Neighborhood list */}
          <div className="lg:col-span-2 space-y-3">
            {neighborhoods.map((n, index) => (
              <button
                key={n.id}
                onClick={() => handleSelect(n)}
                onMouseEnter={() => {
                  setHoveredId(n.id);
                  const m = markersWithCoords[index];
                  if (m) setMapCenter([m.lat, m.lng]);
                }}
                onMouseLeave={() => setHoveredId(null)}
                className={`w-full bg-[#3A3A3A] rounded-xl p-5 border transition-all text-left ${
                  hoveredId === n.id
                    ? 'border-[#1AAFD4]'
                    : 'border-[#484848] hover:border-[#1788B2]'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">#{index + 1}</span>
                    <h3 className="text-base font-bold text-slate-100">{n.name}</h3>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-2xl font-bold text-[#1AAFD4]">{Math.round(n.matchScore)}%</div>
                    <div className="text-xs text-slate-500">match</div>
                  </div>
                </div>

                <div className="h-1.5 bg-[#484848] rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-[#1AAFD4] rounded-full" style={{ width: `${n.matchScore}%` }} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {n.tags.map((tag, i) => (
                    <span key={i} className="px-2.5 py-0.5 bg-[#1AAFD4]/10 text-[#1AAFD4] rounded-full text-xs font-medium border border-[#2E5F8F]/50">
                      {tag}
                    </span>
                  ))}
                </div>

                {!usingFallback && (
                  <div className="mt-2 text-xs text-slate-500">ZIP {n.zip ?? n.id}</div>
                )}
              </button>
            ))}
          </div>

          {/* Real Leaflet map */}
          <div className="lg:col-span-3">
            <div className="bg-[#3A3A3A] rounded-xl border border-[#484848] overflow-hidden sticky top-24">
              <div className="px-5 py-4 border-b border-[#484848] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#1AAFD4]" />
                <span className="font-semibold text-slate-100 text-sm">Neighborhood Map</span>
                {usingFallback && (
                  <span className="ml-auto text-xs text-amber-500">Sample locations</span>
                )}
                {!usingFallback && (
                  <span className="ml-auto text-xs text-slate-500">Click a pin to explore</span>
                )}
              </div>

              <div className="h-[420px]">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  style={{ height: '100%', width: '100%', background: '#2B2B2B' }}
                  zoomControl={true}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  <MapController center={mapCenter} zoom={mapZoom} />

                  {markersWithCoords.map((n, index) => (
                    <Marker
                      key={n.id}
                      position={[n.lat, n.lng]}
                      icon={makeIcon(index + 1, hoveredId === n.id)}
                      eventHandlers={{
                        click: () => handleSelect(n),
                        mouseover: () => setHoveredId(n.id),
                        mouseout: () => setHoveredId(null),
                      }}
                    >
                      <Popup className="leaflet-dark-popup">
                        <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', marginBottom: 4 }}>
                            {n.name}
                          </div>
                          <div style={{ color: '#1AAFD4', fontWeight: 700, fontSize: 18 }}>
                            {Math.round(n.matchScore)}% match
                          </div>
                          {!usingFallback && (
                            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                              ZIP {n.zip ?? n.id}
                            </div>
                          )}
                          <button
                            onClick={() => handleSelect(n)}
                            style={{
                              marginTop: 8, width: '100%', padding: '6px 0',
                              background: '#1AAFD4', color: '#1a1a1a', border: 'none',
                              borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            View Listings →
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && neighborhoods.length === 0 && (
        <div className="text-center py-24 text-slate-500">
          <p className="text-lg font-medium mb-2">No neighborhoods found</p>
          <p className="text-sm">Try a different city or add more priorities.</p>
        </div>
      )}
    </div>
  );
};
