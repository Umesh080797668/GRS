'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
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
      setError('All fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters in length.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must differ from your current temporary password.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      refreshUser();
      setSuccess('Password updated successfully! You can now add an optional recovery email or skip to continue.');
      setStep('email_input');
    } catch (err: any) {
      setError(err.message || 'Failed to update initial password.');
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
      setSuccess(`A 6-digit verification code has been dispatched to ${email}.`);
      setStep('email_verify');
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch verification code.');
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
      setError(err.message || 'Invalid or expired OTP code.');
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
        background: 'radial-gradient(ellipse at top, #1e3a8a 0%, #090e1a 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2.5rem',
          borderRadius: '16px',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: step === 'password' ? '#fef3c7' : '#ecfdf5',
              color: step === 'password' ? '#d97706' : '#059669',
              marginBottom: '1rem',
            }}
          >
            {step === 'password' ? <KeyRound size={28} /> : <Mail size={28} />}
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            {step === 'password' ? t('auth.first_sign_in_title') : t('auth.add_recovery_email')}
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            {step === 'password' ? t('auth.first_sign_in_desc') : t('auth.add_recovery_desc')}
          </p>
        </div>

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
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

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
            <CheckCircle size={16} />
            <span>{success}</span>
          </div>
        )}

        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                {t('auth.current_password')}
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
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                {t('auth.new_password')}
              </label>
              <input
                type="password"
                className="input-field"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                {t('auth.password_requirements')}
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                {t('auth.confirm_password')}
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
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>{t('auth.change_password')}</span>
              )}
            </button>
          </form>
        )}

        {step === 'email_input' && (
          <form onSubmit={handleSendEmailCode} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Official Email Address
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

            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleSkip}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.75rem' }}
              >
                {t('auth.skip_for_now')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ flex: 1, padding: '0.75rem' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : t('auth.send_code')}
              </button>
            </div>
          </form>
        )}

        {step === 'email_verify' && (
          <form onSubmit={handleVerifyEmailCode} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                {t('auth.otp_code')}
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

            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleSkip}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.75rem' }}
              >
                {t('auth.skip_for_now')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ flex: 1, padding: '0.75rem' }}
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
