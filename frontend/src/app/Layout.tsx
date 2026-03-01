import React from 'react';
import { Outlet } from 'react-router';
import { Header } from './components/Header';

export const Layout: React.FC = () => (
  <div className="min-h-screen bg-slate-900">
    <Header />
    <Outlet />
  </div>
);
