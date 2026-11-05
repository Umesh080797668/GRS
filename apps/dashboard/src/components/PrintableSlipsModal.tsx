'use client';

import { Printer, Download, X, ShieldAlert, Key } from 'lucide-react';
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

  const handleDownloadCsv = () => {
    const csvContent = buildCredentialsCsv(credentials);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(csvContent, `grs_credentials_${dateStr}.csv`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: '700px' }}>
        {/* Modal Header */}
        <div className="modal-header">
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

        {/* Security Notice */}
        <div style={{ padding: '1rem 1.5rem 0.5rem 1.5rem' }}>
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

        {/* Slips Preview List */}
        <div style={{ padding: '0.75rem 1.5rem 1.5rem 1.5rem', maxHeight: '52vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {credentials.map((c, i) => (
              <div
                key={i}
                className="print-slip"
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 16px',
                  background: 'var(--slate-50)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  pageBreakInside: 'avoid',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 600 }}>
                    {c.fullName || 'Official Field Operative'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '2px' }}>
                    User Code: <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{c.userCode}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--slate-500)', marginTop: '2px' }}>
                    Role: <span style={{ textTransform: 'uppercase', fontWeight: 600, color: 'var(--slate-700)' }}>{c.role}</span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: '10px', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Initial Password
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                    {c.initialPassword || '••••••••'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
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
