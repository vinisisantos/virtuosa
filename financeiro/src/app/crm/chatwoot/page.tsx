'use client';
import { useState, useEffect, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';

const CHATWOOT_URL = 'http://212.28.186.222:3000';

export default function ChatwootCRMPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-login URL — goes straight to dashboard
  const chatwootDashboardUrl = `${CHATWOOT_URL}/app/accounts/2/dashboard`;

  return (
    <AuthGuard>
      <AppHeader />
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 56px)',
        background: '#0f1117',
        overflow: 'hidden',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(6,182,212,0.05) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          minHeight: '44px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}>
              💬
            </div>
            <div>
              <h1 style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: '#f1f5f9',
                letterSpacing: '-0.01em',
              }}>
                CRM WhatsApp — Chatwoot
              </h1>
              <p style={{
                margin: 0,
                fontSize: '11px',
                color: '#64748b',
              }}>
                Atendimento integrado • Pipeline de leads • Multi-atendente
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a
              href={CHATWOOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94a3b8',
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = '#f1f5f9';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              ↗ Abrir em nova aba
            </a>
            <button
              onClick={() => {
                setLoading(true);
                if (iframeRef.current) {
                  iframeRef.current.src = chatwootDashboardUrl;
                }
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              ↻ Recarregar
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div style={{
            position: 'absolute',
            top: '100px',
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f1117',
            zIndex: 10,
            gap: '16px',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(16,185,129,0.2)',
              borderTopColor: '#10b981',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: '#64748b', fontSize: '13px' }}>
              Carregando Chatwoot CRM...
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}>
            <div style={{ fontSize: '48px' }}>⚠️</div>
            <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600 }}>{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                if (iframeRef.current) {
                  iframeRef.current.src = chatwootDashboardUrl;
                }
              }}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background: '#10b981',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Chatwoot iframe */}
        <iframe
          ref={iframeRef}
          src={chatwootDashboardUrl}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError('Não foi possível carregar o Chatwoot. Verifique se o servidor está online.');
          }}
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            background: '#0f1117',
            display: error ? 'none' : 'block',
          }}
          allow="camera; microphone; clipboard-write; clipboard-read"
        />
      </div>
    </AuthGuard>
  );
}
