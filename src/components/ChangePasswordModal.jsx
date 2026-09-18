import React, { useState } from 'react';
import { KeyRound, Lock, X, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function ChangePasswordModal({ isOpen, onClose }) {
  const { updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleResetForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError(null);
    setSuccess(false);
    setLoading(false);
  };

  const handleClose = () => {
    handleResetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      await updatePassword(newPassword);
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1800);
    } catch (err) {
      console.error('Failed to change password:', err);
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-container max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-600">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="modal-title">Change Password</h2>
              <p className="modal-subtitle">Update your account password</p>
            </div>
          </div>
          {!loading && (
            <button onClick={handleClose} className="modal-close-btn" aria-label="Close modal">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert-error mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <div className="text-sm font-medium text-red-700">{error}</div>
            </div>
          )}

          {success ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Password Updated!</h3>
              <p className="text-sm text-gray-500">Your password has been successfully changed.</p>
            </div>
          ) : (
            <form id="change-password-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">New Password</label>
                <div className="input-with-icon relative">
                  <Lock className="w-4 h-4 text-gray-400 input-icon" />
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Enter new password (min. 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="form-input pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">Confirm New Password</label>
                <div className="input-with-icon relative">
                  <Lock className="w-4 h-4 text-gray-400 input-icon" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Confirm your new password"
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

              {/* Password strength & matching helper note */}
              <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-500 space-y-1">
                <div className={`flex items-center gap-1.5 ${newPassword.length >= 6 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>At least 6 characters long</span>
                </div>
                <div className={`flex items-center gap-1.5 ${newPassword && confirmPassword && newPassword === confirmPassword ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Passwords match</span>
                </div>
              </div>
            </form>
          )}
        </div>

        {!success && (
          <div className="modal-footer">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="change-password-form"
              disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
