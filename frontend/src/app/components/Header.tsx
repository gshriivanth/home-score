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
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 19L18 6L33 19" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="7" y="18" width="22" height="14" rx="1.5" fill="#10b981" />
    <rect x="14" y="23" width="8" height="9" rx="1" fill="#0f172a" />
    <circle cx="27" cy="9" r="7" fill="#059669" />
    <path d="M24 9L26.5 11.5L30 7" stroke="#f0fdf4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentStepIndex = STEPS.findIndex((s) => s.path === location.pathname);

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <HomeScoreLogo />
          <span className="text-xl font-bold text-slate-100">
            Home<span className="text-emerald-500">Score</span>
          </span>
        </button>

        {currentStepIndex >= 0 && (
          <nav className="hidden md:flex items-center gap-1">
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              return (
                <React.Fragment key={step.path}>
                  <div className="flex items-center gap-1">
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors ${
                        isCurrent
                          ? 'bg-emerald-500 text-slate-900'
                          : isCompleted
                            ? 'bg-emerald-900/60 text-emerald-400'
                            : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        isCurrent ? 'text-emerald-400' : isCompleted ? 'text-emerald-600' : 'text-slate-600'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`w-6 h-px mx-1 ${index < currentStepIndex ? 'bg-emerald-800' : 'bg-slate-800'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {currentStepIndex >= 0 && (
          <span className="md:hidden text-sm text-slate-500">
            Step {currentStepIndex + 1} of {STEPS.length}
          </span>
        )}
      </div>
    </header>
  );
};
