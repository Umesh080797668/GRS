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
    <div className="modal-backdrop no-print">
      <div className="modal-content" style={{ maxWidth: '720px' }}>
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Key size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                {t('users.print_credentials')}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                {credentials.length} account credential slip(s) generated.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Security Warning Notice */}
        <div style={{ padding: '1rem 1.5rem 0.5rem 1.5rem' }}>
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#92400e',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{t('users.credential_sheet_notice')}</span>
          </div>
        </div>

        {/* Slips Preview List */}
        <div style={{ padding: '1rem 1.5rem', maxHeight: '50vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
            {credentials.map((c, i) => (
              <div
                key={i}
                className="print-slip"
                style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  pageBreakInside: 'avoid',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    {c.fullName || 'Official Field Operative'}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    User Code: <span style={{ fontFamily: 'monospace' }}>{c.userCode}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Role: <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{c.role}</span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textAlign: 'right',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Initial Password
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>
                    {c.initialPassword || '••••••••'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            borderBottomLeftRadius: '16px',
            borderBottomRightRadius: '16px',
          }}
        >
          <button onClick={handleDownloadCsv} className="btn-secondary">
            <Download size={16} />
            <span>Download Injection-Safe CSV</span>
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handlePrint} className="btn-primary">
              <Printer size={16} />
              <span>Print Credential Slips</span>
            </button>
            <button onClick={onClose} className="btn-secondary">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
