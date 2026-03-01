import React from 'react';
import { useNavigate, useLocation } from 'react-router';

const STEPS = [
  { path: '/', label: 'City' },
  { path: '/priorities', label: 'Priorities' },
  { path: '/preferences', label: 'Home Details' },
  { path: '/neighborhoods', label: 'Neighborhoods' },
  { path: '/listings', label: 'Listings' },
  { path: '/summary', label: 'Summary' },
];

const HomeScoreLogo: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 19L18 6L33 19" stroke="#1AAFD4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="7" y="18" width="22" height="14" rx="1.5" fill="#1AAFD4" />
    <rect x="14" y="23" width="8" height="9" rx="1" fill="#2B2B2B" />
    <circle cx="27" cy="9" r="7" fill="#1788B2" />
    <path d="M24 9L26.5 11.5L30 7" stroke="#f0fdf4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentStepIndex = STEPS.findIndex((s) => s.path === location.pathname);

  return (
    <header className="bg-[#2B2B2B] border-b border-[#333333] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <HomeScoreLogo />
          <span className="text-xl font-bold text-slate-100">
            Home<span className="text-[#1AAFD4]">Score</span>
          </span>
        </button>

        {currentStepIndex >= 0 && (
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5">
              {STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`rounded-full transition-all ${
                    index === currentStepIndex
                      ? 'w-4 h-2 bg-[#1AAFD4]'
                      : index < currentStepIndex
                        ? 'w-2 h-2 bg-[#1788B2]'
                        : 'w-2 h-2 bg-[#484848]'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-[#1AAFD4] font-medium">{STEPS[currentStepIndex].label}</span>
          </div>
        )}
      </div>
    </header>
  );
};
