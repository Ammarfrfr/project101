import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, Lock, Mail, ArrowRight, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

export function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setSuccessMsg('Account created successfully! If email confirmation is enabled, please check your inbox.');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      {/* Dumroo Top Nav Header */}
      <header className="auth-header">
        <div className="flex items-center gap-2.5">
          <div className="brand-logo-icon">
            <span className="brand-infinity">∞</span>
          </div>
          <span className="brand-title">Dumroo<span className="brand-title-accent">.ai</span></span>
        </div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Document Intelligence
        </div>
      </header>

      <div className="auth-card-wrapper">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-icon-badge">
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
            <h1 className="auth-title">
              {isSignUp ? 'Create your Dumroo account' : 'Welcome back to Dumroo'}
            </h1>
            <p className="auth-subtitle">
              {isSignUp
                ? 'Sign up to upload PDFs, generate vector embeddings, and get cited summaries'
                : 'Sign in to access your indexed documents and chat history'}
            </p>
          </div>

          {error && (
            <div className="alert-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <div className="text-sm font-medium text-red-700">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="alert-success">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-600" />
              <div className="text-sm font-medium text-green-700">{successMsg}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address</label>
              <div className="input-with-icon">
                <Mail className="w-4 h-4 text-gray-400 input-icon" />
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="input-with-icon">
                <Lock className="w-4 h-4 text-gray-400 input-icon" />
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-auth-submit"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>{isSignUp ? 'Creating Account...' : 'Signing In...'}</span>
                </>
              ) : (
                <>
                  <span>{isSignUp ? 'Sign Up' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </button>
          </form>

          <div className="auth-toggle-row">
            <span className="text-sm text-gray-500">
              {isSignUp ? 'Already have an account?' : "Don't have an account yet?"}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccessMsg(null);
              }}
              className="auth-toggle-btn"
            >
              {isSignUp ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>

        {/* Informational footer note */}
        <div className="auth-footer-note">
          <p>Powered by <strong>Supabase pgvector</strong> & <strong>Google Gemini 2.0 Flash</strong></p>
        </div>
      </div>
    </div>
  );
}
