'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSwitch from '../../components/LanguageSwitch';
import { api, ApiError } from '../../lib/api';
import { ShieldCheck, Lock, User, AlertCircle, CheckCircle, Loader2, Mail, ArrowLeft } from 'lucide-react';

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
      setError(t('auth.error.credentials_required'));
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
          setError(t('auth.error.upgrade_required'));
        } else if (err.status === 429 || err.code === 'RATE_LIMITED') {
          setError(t('auth.error.rate_limited'));
        } else if (err.messageKey) {
          setError(t(err.messageKey));
        } else {
          setError(err.message || t('auth.error.invalid_credentials'));
        }
      } else {
        setError(err.message || t('auth.error.auth_failed'));
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
      setForgotSuccess(t('auth.success.code_sent'));
    } catch (err: any) {
      setForgotError(err.messageKey ? t(err.messageKey) : (err.message || t('auth.error.reset_request_failed')));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !resetNewPassword) {
      setForgotError(t('auth.error.otp_required'));
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setForgotError(t('auth.error.password_mismatch'));
      return;
    }
    if (resetNewPassword.length < 8) {
      setForgotError(t('auth.error.password_length'));
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    try {
      await api.confirmPasswordReset(forgotEmail.trim(), resetCode.trim(), resetNewPassword.trim());
      setShowForgotModal(false);
      setSuccess(t('auth.success.password_reset'));
      setForgotStep('request');
      setResetCode('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err: any) {
      setForgotError(err.messageKey ? t(err.messageKey) : (err.message || t('auth.error.reset_failed')));
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-page)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative',
      }}
    >
      {/* Top Header Bar for Language Selection */}
      <div
        style={{
          position: 'absolute',
          top: '1.25rem',
          right: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <LanguageSwitch variant="light" />
      </div>

      <div
        style={{
          maxWidth: '420px',
          width: '100%',
          background: '#ffffff',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '2.25rem',
        }}
      >
        {/* Emblem / Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-subtle)',
              color: 'var(--primary)',
              border: '1px solid var(--primary-subtle-hover)',
              marginBottom: '1rem',
            }}
          >
            <ShieldCheck size={26} />
          </div>

          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--slate-900)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {t('app.title')}
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--slate-500)', marginTop: '4px' }}>
            {t('app.subtitle')}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              color: 'var(--danger-text)',
              fontSize: '12.5px',
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
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              color: 'var(--success-text)',
              fontSize: '12.5px',
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          <div>
            <label className="form-label">
              {t('auth.identifier')}
            </label>
            <div style={{ position: 'relative' }}>
              <User
                size={16}
                color="var(--slate-400)"
                style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                className="input-field"
                placeholder="e.g. AGT-001 or admin@grs.gov.lk"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                style={{ paddingLeft: '36px' }}
                required
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
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
                  color: 'var(--primary)',
                  fontSize: '11.5px',
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
                color="var(--slate-400)"
                style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '36px' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', padding: '0.65rem', marginTop: '0.5rem', fontSize: '14px' }}
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

        <div style={{ textAlign: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--slate-100)', paddingTop: '1rem' }}>
          <p style={{ fontSize: '11px', color: 'var(--slate-400)', margin: 0, lineHeight: 1.4 }}>
            Official government enumeration system. Unauthorized access strictly prohibited.
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                  {t('auth.forgot_password_title')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '3px 0 0 0' }}>
                  {t('auth.forgot_password_desc')}
                </p>
              </div>
            </div>

            {forgotError && (
              <div style={{ margin: '1rem 1.5rem 0', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--danger-text)' }}>
                {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div style={{ margin: '1rem 1.5rem 0', background: 'var(--success-bg)', border: '1px solid var(--success-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--success-text)' }}>
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 'request' ? (
              <form onSubmit={handleRequestReset} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label">
                    Registered Email Address *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} color="var(--slate-400)" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="email"
                      className="input-field"
                      placeholder="e.g. user@grs.gov.lk"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      style={{ paddingLeft: '36px' }}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.25rem' }}>
                  <button type="button" onClick={() => setShowForgotModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={forgotLoading} className="btn-primary">
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : t('auth.send_code')}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label">
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
                  <label className="form-label">
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
                  <label className="form-label">
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.25rem' }}>
                  <button type="button" onClick={() => setForgotStep('request')} className="btn-secondary">
                    <ArrowLeft size={14} />
                    <span>Back</span>
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
