import React from 'react';
import { Outlet } from 'react-router';
import { Header } from './components/Header';

export const Layout: React.FC = () => (
  <div className="min-h-screen bg-gray-50">
    <Header />
    <Outlet />
  </div>
);
