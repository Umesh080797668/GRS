'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSwitch from '../../components/LanguageSwitch';
import { api, ApiError } from '../../lib/api';
import { ShieldCheck, Lock, User, AlertCircle, CheckCircle, Loader2, Mail } from 'lucide-react';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { t } = useLanguage();

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'confirm'>('request');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please provide both User ID/Email and Password.');
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 426 || err.code === 'UPGRADE_REQUIRED') {
          setError('Application version is outdated. Please refresh your browser (HTTP 426).');
        } else if (err.status === 429 || err.code === 'RATE_LIMITED') {
          setError('Too many failed attempts. Please wait before retrying.');
        } else if (err.messageKey === 'errors.auth.account_locked') {
          setError('Account temporarily locked due to too many failed attempts. Try again later.');
        } else if (err.messageKey === 'errors.auth.deactivated') {
          setError('Your account has been deactivated. Please contact your supervisor or administrator.');
        } else if (err.messageKey === 'errors.auth.initial_password_expired') {
          setError('Your initial temporary password has expired. Please contact an administrator to reissue.');
        } else {
          setError(err.message || 'Invalid User ID, email, or password. Please verify credentials.');
        }
      } else {
        setError(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    setForgotError(null);
    try {
      await api.requestPasswordReset(forgotEmail.trim());
      setForgotStep('confirm');
      setForgotSuccess(`If an account is associated with ${forgotEmail}, a 6-digit verification code has been dispatched.`);
    } catch (err: any) {
      setForgotError(err.message || 'Failed to request password reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !resetNewPassword) {
      setForgotError('Please enter the 6-digit OTP code and new password.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setForgotError('New passwords do not match.');
      return;
    }
    if (resetNewPassword.length < 8) {
      setForgotError('Password must be at least 8 characters long.');
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    try {
      await api.confirmPasswordReset(forgotEmail.trim(), resetCode.trim(), resetNewPassword.trim());
      setShowForgotModal(false);
      setSuccess('Password has been successfully reset. Please sign in with your new password.');
      setForgotStep('request');
      setResetCode('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err: any) {
      setForgotError(err.message || 'Failed to reset password. Please verify OTP code.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #1e3a8a 0%, #090e1a 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      {/* Top Bar Switcher */}
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
        <LanguageSwitch />
      </div>

      <div
        className="glass-panel"
        style={{
          maxWidth: '440px',
          width: '100%',
          padding: '2.5rem',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.4)',
          borderRadius: '16px',
        }}
      >
        {/* Emblem / Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
              color: '#ffffff',
              boxShadow: '0 8px 16px rgba(37, 99, 235, 0.3)',
              marginBottom: '1rem',
            }}
          >
            <ShieldCheck size={32} color="#f59e0b" />
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            {t('app.title')}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
            {t('app.subtitle')}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#dc2626',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '1.25rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#059669',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '1.25rem',
            }}
          >
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              {t('auth.identifier')}
            </label>
            <div style={{ position: 'relative' }}>
              <User
                size={16}
                color="#94a3b8"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                className="input-field"
                placeholder="e.g. AGT-001 or admin@grs.gov.lk"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                style={{ paddingLeft: '38px' }}
                required
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                {t('auth.password')}
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(true);
                  setForgotError(null);
                  setForgotSuccess(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {t('auth.forgot_password')}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                color="#94a3b8"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '38px' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <span>{t('auth.login')}</span>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
            Official government system. Unauthorized access strictly prohibited.
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{t('auth.forgot_password_title')}</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                {t('auth.forgot_password_desc')}
              </p>
            </div>

            {forgotError && (
              <div style={{ margin: '1rem 1.5rem 0', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: '#dc2626' }}>
                {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div style={{ margin: '1rem 1.5rem 0', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: '#065f46' }}>
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 'request' ? (
              <form onSubmit={handleRequestReset} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Registered Email Address *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="email"
                      className="input-field"
                      placeholder="e.g. user@grs.gov.lk"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      style={{ paddingLeft: '38px' }}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowForgotModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={forgotLoading} className="btn-primary">
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : t('auth.send_code')}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    {t('auth.otp_code')} *
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 123456"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    {t('auth.new_password')} *
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="At least 8 characters"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    {t('auth.confirm_password')} *
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Re-enter new password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setForgotStep('request')} className="btn-secondary">
                    Back
                  </button>
                  <button type="submit" disabled={forgotLoading} className="btn-primary">
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : t('auth.reset_password_btn')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
