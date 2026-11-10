'use client';

import { useState } from 'react';
import {
  Printer,
  Download,
  X,
  ShieldAlert,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { buildCredentialsCsv, downloadFile } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';

export interface CredentialSlipItem {
  userCode: string;
  role: string;
  fullName?: string;
  initialPassword?: string;
}

interface PrintableSlipsModalProps {
  credentials: CredentialSlipItem[];
  onClose: () => void;
}

export default function PrintableSlipsModal({
  credentials,
  onClose,
}: PrintableSlipsModalProps) {
  const { t } = useLanguage();
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const allRevealed =
    credentials.length > 0 &&
    credentials.every((_, i) => visiblePasswords[i]);

  const toggleAllPasswords = () => {
    if (allRevealed) {
      setVisiblePasswords({});
    } else {
      const next: Record<number, boolean> = {};
      credentials.forEach((_, i) => {
        next[i] = true;
      });
      setVisiblePasswords(next);
    }
  };

  const togglePasswordVisibility = (index: number) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleCopy = (text: string, fieldId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField((prev) => (prev === fieldId ? null : prev));
    }, 2000);
  };

  const handleDownloadCsv = () => {
    const csvContent = buildCredentialsCsv(credentials);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(csvContent, `grs_credentials_${dateStr}.csv`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: '720px' }}>
        {/* Modal Header */}
        <div className="modal-header no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--primary-subtle)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Key size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--slate-900)' }}>
                {t('users.print_credentials')}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--slate-500)', margin: '2px 0 0 0' }}>
                {credentials.length} account credential slip(s) generated.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {credentials.length > 1 && (
              <button
                type="button"
                onClick={toggleAllPasswords}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 8px', height: 'auto' }}
              >
                {allRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{allRevealed ? 'Hide All' : 'Reveal All'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close dialog"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--slate-400)',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="no-print" style={{ padding: '1rem 1.5rem 0.5rem 1.5rem' }}>
          <div
            style={{
              background: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              fontSize: '12.5px',
              color: 'var(--warning-text)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              lineHeight: 1.45,
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{t('users.credential_sheet_notice')}</span>
          </div>
        </div>

        {/* Slips List Container */}
        <div
          className="printable-slips-container"
          style={{ padding: '0.75rem 1.5rem 1.5rem 1.5rem', maxHeight: '52vh', overflowY: 'auto' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {credentials.map((c, i) => (
              <div
                key={i}
                className="print-slip"
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 18px',
                  background: 'var(--slate-50)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  pageBreakInside: 'avoid',
                }}
              >
                {/* Print-only official slip header */}
                <div
                  className="print-only-header"
                  style={{
                    display: 'none',
                    borderBottom: '1px solid #cbd5e1',
                    paddingBottom: '8px',
                    marginBottom: '10px',
                    width: '100%',
                  }}
                >
                  <div style={{ fontSize: '13pt', fontWeight: 'bold', color: '#0f172a' }}>
                    GOV.LK — GRS Door-to-Door Skills Campaign 2026
                  </div>
                  <div style={{ fontSize: '9pt', color: '#64748b' }}>
                    Official Account Credential & Temporary Access Slip
                  </div>
                </div>

                {/* Account Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 600 }}>
                    {c.fullName || 'Official Field Operative'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--slate-900)' }}>
                      User Code:{' '}
                      <span style={{ fontFamily: 'monospace', color: 'var(--primary)', letterSpacing: '0.04em' }}>
                        {c.userCode || 'Generating...'}
                      </span>
                    </div>

                    {c.userCode && (
                      <button
                        type="button"
                        onClick={() => handleCopy(c.userCode, `code-${i}`)}
                        title="Copy User Code"
                        className="no-print"
                        style={{
                          background: copiedField === `code-${i}` ? 'var(--success-bg)' : '#ffffff',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '2px 7px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: copiedField === `code-${i}` ? 'var(--success)' : 'var(--slate-600)',
                          fontWeight: 500,
                        }}
                      >
                        {copiedField === `code-${i}` ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedField === `code-${i}` ? 'Copied' : 'Copy ID'}</span>
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: '11.5px', color: 'var(--slate-500)', marginTop: '3px' }}>
                    Role:{' '}
                    <span style={{ textTransform: 'uppercase', fontWeight: 600, color: 'var(--slate-700)' }}>
                      {c.role}
                    </span>
                  </div>
                </div>

                {/* Password Box */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'right',
                    flexShrink: 0,
                    minWidth: '170px',
                  }}
                >
                  <div style={{ fontSize: '10px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Initial Password
                  </div>

                  <div style={{ marginTop: '2px' }}>
                    {/* Screen password display (masked or unmasked) */}
                    <span
                      className="screen-pwd"
                      style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--primary)',
                        fontFamily: 'monospace',
                        letterSpacing: visiblePasswords[i] ? '0.04em' : '0.12em',
                      }}
                    >
                      {visiblePasswords[i]
                        ? (c.initialPassword || 'N/A')
                        : (c.initialPassword ? '••••••••' : '••••••••')}
                    </span>

                    {/* Print password display (always raw plaintext) */}
                    <span
                      className="print-pwd-raw"
                      style={{
                        display: 'none',
                        fontSize: '13pt',
                        fontWeight: 'bold',
                        color: '#004d40',
                        fontFamily: 'monospace',
                      }}
                    >
                      {c.initialPassword || 'N/A'}
                    </span>
                  </div>

                  {/* Password Action Buttons (Reveal / Hide & Copy) */}
                  <div
                    className="no-print"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '5px',
                      marginTop: '6px',
                    }}
                  >
                    {c.initialPassword && (
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(i)}
                        title={visiblePasswords[i] ? 'Hide Password' : 'Show Password'}
                        style={{
                          background: '#ffffff',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '3px 6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '11px',
                          color: 'var(--slate-600)',
                        }}
                      >
                        {visiblePasswords[i] ? <EyeOff size={12} /> : <Eye size={12} />}
                        <span>{visiblePasswords[i] ? 'Hide' : 'View'}</span>
                      </button>
                    )}

                    {c.initialPassword && (
                      <button
                        type="button"
                        onClick={() => handleCopy(c.initialPassword || '', `pwd-${i}`)}
                        title="Copy Password"
                        style={{
                          background: copiedField === `pwd-${i}` ? 'var(--success-bg)' : '#ffffff',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '3px 6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '11px',
                          color: copiedField === `pwd-${i}` ? 'var(--success)' : 'var(--slate-600)',
                          fontWeight: 500,
                        }}
                      >
                        {copiedField === `pwd-${i}` ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedField === `pwd-${i}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Print-only footer notice */}
                <div
                  className="print-only-footer"
                  style={{
                    display: 'none',
                    fontSize: '8pt',
                    color: '#64748b',
                    borderTop: '1px dashed #cbd5e1',
                    paddingTop: '6px',
                    marginTop: '10px',
                    width: '100%',
                  }}
                >
                  Important: This temporary password must be changed immediately upon first sign-in at the mobile app or web portal.
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer no-print" style={{ justifyContent: 'space-between' }}>
          <button type="button" onClick={handleDownloadCsv} className="btn-secondary">
            <Download size={15} />
            <span>Download Injection-Safe CSV</span>
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={handlePrint} className="btn-primary">
              <Printer size={15} />
              <span>Print Credential Slips</span>
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
