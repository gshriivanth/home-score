import React, { useState, useEffect, useRef } from 'react';
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

const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};

interface Suggestion {
  label: string;
}

async function fetchCitySuggestions(query: string): Promise<Suggestion[]> {
  if (query.length < 2) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=us&limit=7&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } },
    );
    const data = await res.json() as {
      address: { city?: string; town?: string; village?: string; municipality?: string; state?: string; country_code?: string };
    }[];

    const seen = new Set<string>();
    return data
      .filter((item) => {
        const addr = item.address;
        return addr.country_code === 'us' && (addr.city || addr.town || addr.village || addr.municipality);
      })
      .map((item) => {
        const addr = item.address;
        const cityName = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? '';
        const stateAbbr = STATE_ABBR[addr.state ?? ''] ?? addr.state ?? '';
        return { label: `${cityName}, ${stateAbbr}` };
      })
      .filter((s) => {
        if (seen.has(s.label)) return false;
        seen.add(s.label);
        return true;
      });
  } catch {
    return [];
  }
}

export const CityInput: React.FC = () => {
  const navigate = useNavigate();
  const { city, setCity } = usePreferences();
  const [inputValue, setInputValue] = useState(city);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContinue = (value?: string) => {
    const final = (value ?? inputValue).trim();
    if (!final) return;
    setCity(final);
    navigate('/priorities');
  };

  const selectSuggestion = (label: string) => {
    setInputValue(label);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  // Debounce fetching suggestions
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inputValue.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await fetchCitySuggestions(inputValue);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setActiveIndex(-1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        selectSuggestion(suggestions[activeIndex].label);
      } else {
        setShowSuggestions(false);
        handleContinue();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  };

  const handlePopularCity = (c: string) => {
    setInputValue(c);
  };

  return (
    <div className="min-h-[calc(100vh-57px)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#1AAFD4]/10 border border-[#2E5F8F]/50 mb-8">
            <MapPin className="w-10 h-10 text-[#1AAFD4]" strokeWidth={1.5} />
          </div>

          <h1 className="text-5xl font-bold text-slate-100 mb-4 leading-tight">
            Find your perfect<br />
            <span className="text-[#1AAFD4]">neighborhood</span>
          </h1>
          <p className="text-xl text-slate-400 mb-12">
            Tell us where you're looking and we'll match you with the best neighborhoods for your lifestyle.
          </p>

          {/* Input with autocomplete */}
          <div ref={containerRef} className="relative mb-4">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 z-10" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Enter a city, e.g. San Francisco, CA"
              className="w-full bg-[#3A3A3A] border-2 border-[#484848] rounded-xl pl-14 pr-6 py-5 text-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#1AAFD4] transition-colors"
              autoFocus
              autoComplete="off"
            />

            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full mt-1 bg-[#3A3A3A] border border-[#484848] rounded-xl overflow-hidden z-50">
                {suggestions.map((s, i) => (
                  <li
                    key={s.label}
                    onMouseDown={() => selectSuggestion(s.label)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors text-left ${
                      i === activeIndex
                        ? 'bg-[#1AAFD4]/10 text-[#1AAFD4]'
                        : 'text-slate-200 hover:bg-[#454545]'
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="text-sm font-medium">{s.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => handleContinue()}
            disabled={!inputValue.trim()}
            className="w-full py-4 rounded-xl bg-[#1AAFD4] hover:bg-[#1788B2] disabled:bg-[#3A3A3A] disabled:text-slate-600 text-[#1a1a1a] font-semibold text-lg transition-colors mb-12"
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
                  className="px-4 py-2 rounded-lg bg-[#3A3A3A] border border-[#484848] text-slate-400 text-sm font-medium hover:border-[#1AAFD4] hover:text-[#1AAFD4] transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
