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
    {/* House roof */}
    <path d="M3 19L18 6L33 19" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {/* House body */}
    <rect x="7" y="18" width="22" height="14" rx="1.5" fill="#16a34a" />
    {/* Door */}
    <rect x="14" y="23" width="8" height="9" rx="1" fill="white" />
    {/* Score badge */}
    <circle cx="27" cy="9" r="7" fill="#15803d" />
    {/* Checkmark */}
    <path d="M24 9L26.5 11.5L30 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const currentStepIndex = STEPS.findIndex((s) => s.path === location.pathname);

  return (
    <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <HomeScoreLogo />
          <span className="text-xl font-bold text-gray-900">
            Home<span className="text-green-600">Score</span>
          </span>
        </button>

        {/* Step progress (hidden on mobile) */}
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
                          ? 'bg-green-600 text-white'
                          : isCompleted
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        isCurrent ? 'text-green-700' : isCompleted ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`w-6 h-px mx-1 ${index < currentStepIndex ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {/* Mobile: just step count */}
        {currentStepIndex >= 0 && (
          <span className="md:hidden text-sm text-gray-500">
            Step {currentStepIndex + 1} of {STEPS.length}
          </span>
        )}
      </div>
    </header>
  );
};
