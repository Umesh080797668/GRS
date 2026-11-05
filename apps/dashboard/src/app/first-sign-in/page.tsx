'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSwitch from '../../components/LanguageSwitch';
import { api } from '../../lib/api';
import { KeyRound, Mail, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function FirstSignInPage() {
  const [step, setStep] = useState<'password' | 'email_input' | 'email_verify'>('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Email recovery step
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('auth.error.all_fields_required'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.error.password_mismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('auth.error.password_length'));
      return;
    }

    if (newPassword === currentPassword) {
      setError(t('auth.error.password_same_as_current'));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      refreshUser();
      setSuccess(t('auth.success.password_updated'));
      setStep('email_input');
    } catch (err: any) {
      setError(err.messageKey ? t(err.messageKey) : (err.message || t('auth.error.reset_failed')));
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await api.addPendingEmail(email.trim());
      setSuccess(t('auth.success.email_code_sent'));
      setStep('email_verify');
    } catch (err: any) {
      setError(err.messageKey ? t(err.messageKey) : (err.message || t('auth.error.email_code_failed')));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailCode.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await api.verifyEmail(emailCode.trim());
      refreshUser();
      router.replace('/progress');
    } catch (err: any) {
      setError(err.messageKey ? t(err.messageKey) : (err.message || t('auth.error.otp_invalid_expired')));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    refreshUser();
    router.replace('/progress');
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
      <div
        style={{
          position: 'absolute',
          top: '1.25rem',
          right: '1.5rem',
        }}
      >
        <LanguageSwitch variant="light" />
      </div>

      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          background: '#ffffff',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '2.25rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: step === 'password' ? 'var(--warning-bg)' : 'var(--primary-subtle)',
              color: step === 'password' ? 'var(--warning-text)' : 'var(--primary)',
              border: `1px solid ${step === 'password' ? 'var(--warning-border)' : 'var(--primary-subtle-hover)'}`,
              marginBottom: '1rem',
            }}
          >
            {step === 'password' ? <KeyRound size={24} /> : <Mail size={24} />}
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--slate-900)', margin: 0, letterSpacing: '-0.01em' }}>
            {step === 'password' ? t('auth.first_sign_in_title') : t('auth.add_recovery_email')}
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--slate-500)', marginTop: '4px', lineHeight: 1.45 }}>
            {step === 'password' ? t('auth.first_sign_in_desc') : t('auth.add_recovery_desc')}
          </p>
        </div>

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

        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
            <div>
              <label className="form-label">
                {t('auth.current_password')} *
              </label>
              <input
                type="password"
                className="input-field"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
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
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <span className="form-hint">
                {t('auth.password_requirements')}
              </span>
            </div>

            <div>
              <label className="form-label">
                {t('auth.confirm_password')} *
              </label>
              <input
                type="password"
                className="input-field"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
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
                  <span>{t('auth.updating_password')}</span>
                </>
              ) : (
                <span>{t('auth.change_password')}</span>
              )}
            </button>
          </form>
        )}

        {step === 'email_input' && (
          <form onSubmit={handleSendEmailCode} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
            <div>
              <label className="form-label">
                Official Email Address *
              </label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. user@grs.gov.lk"
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleSkip}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.65rem' }}
              >
                {t('auth.skip_for_now')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ flex: 1, padding: '0.65rem' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : t('auth.send_code')}
              </button>
            </div>
          </form>
        )}

        {step === 'email_verify' && (
          <form onSubmit={handleVerifyEmailCode} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
            <div>
              <label className="form-label">
                {t('auth.otp_code')} *
              </label>
              <input
                type="text"
                maxLength={6}
                className="input-field"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                placeholder="e.g. 123456"
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleSkip}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.65rem' }}
              >
                {t('auth.skip_for_now')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ flex: 1, padding: '0.65rem' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : t('auth.verify_email_btn')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
