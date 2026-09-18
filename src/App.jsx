import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { MainLayout } from './components/MainLayout';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading, isPasswordRecovery } = useAuth();

  if (loading) {
    return (
      <div className="fullscreen-loader">
        <div className="loader-box">
          <div className="brand-logo-icon animate-pulse mb-3">
            <span className="brand-infinity text-2xl">∞</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600 font-medium text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            <span>Connecting to Dumroo AI...</span>
          </div>
        </div>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return <LoginPage initialMode="update_password" />;
  }

  return user ? <MainLayout /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
