import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, Lock, Mail, ArrowRight, AlertCircle, Loader2, CheckCircle2, KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';

export function LoginPage({ initialMode = 'signin' }) {
  const [authMode, setAuthMode] = useState(initialMode); // 'signin' | 'signup' | 'forgot_password' | 'update_password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const { signIn, signUp, resetPassword, updatePassword, isPasswordRecovery } = useAuth();

  useEffect(() => {
    if (isPasswordRecovery || initialMode === 'update_password') {
      setAuthMode('update_password');
    }
  }, [isPasswordRecovery, initialMode]);

  const switchMode = (mode) => {
    setAuthMode(mode);
    setError(null);
    setSuccessMsg(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (authMode === 'forgot_password') {
      if (!email) {
        setError('Please enter your email address.');
        return;
      }
      setLoading(true);
      try {
        await resetPassword(email);
        setSuccessMsg('Password reset link has been sent to your email. Please check your inbox.');
      } catch (err) {
        console.error('Reset password error:', err);
        setError(err.message || 'Failed to send reset link. Please check your email.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (authMode === 'update_password') {
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter.');
        return;
      }
      setLoading(true);
      try {
        await updatePassword(password);
        setSuccessMsg('Password updated successfully! Redirecting...');
      } catch (err) {
        console.error('Update password error:', err);
        setError(err.message || 'Failed to update password. Please try again.');
        setLoading(false);
      }
      return;
    }

    // Standard Sign In / Sign Up
    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }

    setLoading(true);

    try {
      if (authMode === 'signup') {
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

  const getHeaderInfo = () => {
    switch (authMode) {
      case 'signup':
        return {
          icon: <Sparkles className="w-5 h-5 text-amber-500" />,
          title: 'Create your Dumroo account',
          subtitle: 'Sign up to upload PDFs, generate vector embeddings, and get cited summaries'
        };
      case 'forgot_password':
        return {
          icon: <KeyRound className="w-5 h-5 text-amber-500" />,
          title: 'Reset your password',
          subtitle: "Enter your email address and we'll send you a link to reset your password"
        };
      case 'update_password':
        return {
          icon: <Lock className="w-5 h-5 text-amber-500" />,
          title: 'Set new password',
          subtitle: 'Enter and confirm your new password below'
        };
      case 'signin':
      default:
        return {
          icon: <Sparkles className="w-5 h-5 text-amber-500" />,
          title: 'Welcome back to Dumroo',
          subtitle: 'Sign in to access your indexed documents and chat history'
        };
    }
  };

  const header = getHeaderInfo();

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
              {header.icon}
            </div>
            <h1 className="auth-title">{header.title}</h1>
            <p className="auth-subtitle">{header.subtitle}</p>
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
            {/* Email input (for signin, signup, forgot_password) */}
            {authMode !== 'update_password' && (
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
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {/* Password input (for signin, signup, update_password) */}
            {authMode !== 'forgot_password' && (
              <div className="form-group">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="form-label mb-0" htmlFor="password">
                    {authMode === 'update_password' ? 'New Password' : 'Password'}
                  </label>
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot_password')}
                      className="text-xs text-amber-600 hover:text-amber-700 font-semibold hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="input-with-icon relative">
                  <Lock className="w-4 h-4 text-gray-400 input-icon" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder={authMode === 'update_password' ? 'Min. 6 characters' : '••••••••'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password input (only for update_password) */}
            {authMode === 'update_password' && (
              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">Confirm New Password</label>
                <div className="input-with-icon relative">
                  <Lock className="w-4 h-4 text-gray-400 input-icon" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="form-input pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-auth-submit"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>
                    {authMode === 'signup' && 'Creating Account...'}
                    {authMode === 'signin' && 'Signing In...'}
                    {authMode === 'forgot_password' && 'Sending Reset Link...'}
                    {authMode === 'update_password' && 'Updating Password...'}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {authMode === 'signup' && 'Sign Up'}
                    {authMode === 'signin' && 'Sign In'}
                    {authMode === 'forgot_password' && 'Send Reset Link'}
                    {authMode === 'update_password' && 'Set New Password'}
                  </span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </button>
          </form>

          {/* Bottom navigation switches */}
          <div className="auth-toggle-row">
            {authMode === 'forgot_password' ? (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium mx-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Sign In</span>
              </button>
            ) : authMode === 'update_password' ? (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium mx-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Sign In</span>
              </button>
            ) : (
              <>
                <span className="text-sm text-gray-500">
                  {authMode === 'signup' ? 'Already have an account?' : "Don't have an account yet?"}
                </span>
                <button
                  type="button"
                  onClick={() => switchMode(authMode === 'signup' ? 'signin' : 'signup')}
                  className="auth-toggle-btn"
                >
                  {authMode === 'signup' ? 'Sign in' : 'Create account'}
                </button>
              </>
            )}
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
