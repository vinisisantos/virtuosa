'use client';
import { useState, useEffect, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';

// Will be updated to https://crm.clinicasgestao.com.br once DNS is configured
const CHATWOOT_URL = 'http://212.28.186.222:3000';
const CHATWOOT_HTTPS_URL = 'https://crm.clinicasgestao.com.br';

export default function ChatwootCRMPage() {
  const [loading, setLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [useHttps, setUseHttps] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Check if HTTPS version is available
  useEffect(() => {
    fetch(CHATWOOT_HTTPS_URL + '/auth/sign_in', { method: 'HEAD', mode: 'no-cors' })
      .then(() => setUseHttps(true))
      .catch(() => setUseHttps(false));
  }, []);

  const chatwootUrl = useHttps ? CHATWOOT_HTTPS_URL : CHATWOOT_URL;
  const dashboardUrl = `${chatwootUrl}/app/accounts/2/dashboard`;
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const willBlockMixed = isHttpsPage && !useHttps;

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
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
            }}>💬</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
                CRM WhatsApp — Chatwoot
              </h1>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                Atendimento integrado • Pipeline de leads • Multi-atendente
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a href={chatwootUrl} target="_blank" rel="noopener noreferrer"
              style={{
                padding: '6px 14px', borderRadius: '6px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600,
                textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              ↗ Abrir Chatwoot
            </a>
          </div>
        </div>

        {/* Main content */}
        {willBlockMixed ? (
          /* Show message when Mixed Content would block iframe */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            padding: '40px',
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '20px',
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '36px',
            }}>
              💬
            </div>
            <h2 style={{
              color: '#f1f5f9', fontSize: '20px', fontWeight: 700,
              textAlign: 'center', margin: 0,
            }}>
              Chatwoot CRM
            </h2>
            <p style={{
              color: '#94a3b8', fontSize: '14px', textAlign: 'center',
              maxWidth: '440px', lineHeight: 1.6, margin: 0,
            }}>
              O CRM está rodando e pronto para uso. Clique no botão abaixo para acessar
              o painel de atendimento com todas as conversas do WhatsApp.
            </p>
            
            {/* Feature cards */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px', width: '100%', maxWidth: '600px', margin: '12px 0',
            }}>
              {[
                { icon: '📱', title: 'WhatsApp', desc: 'Conversas em tempo real' },
                { icon: '📊', title: 'Pipeline', desc: 'Kanban de leads' },
                { icon: '👥', title: 'Multi-atendente', desc: 'Atribuição automática' },
              ].map(f => (
                <div key={f.title} style={{
                  padding: '16px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>{f.icon}</div>
                  <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>{f.title}</div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>{f.desc}</div>
                </div>
              ))}
            </div>

            <a href={chatwootUrl} target="_blank" rel="noopener noreferrer"
              style={{
                padding: '12px 32px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff', fontSize: '14px', fontWeight: 700,
                textDecoration: 'none', cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 24px rgba(16,185,129,0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(16,185,129,0.3)';
              }}
            >
              Abrir Painel do Chatwoot ↗
            </a>

            <p style={{
              color: '#475569', fontSize: '11px', textAlign: 'center',
              maxWidth: '400px', margin: 0,
            }}>
              💡 Para embutir diretamente aqui, crie um registro DNS:<br/>
              <code style={{
                background: 'rgba(255,255,255,0.05)', padding: '2px 6px',
                borderRadius: '4px', fontSize: '11px', color: '#94a3b8',
              }}>
                crm.clinicasgestao.com.br → 212.28.186.222
              </code>
            </p>
          </div>
        ) : (
          /* Show iframe when HTTPS is available or page is HTTP */
          <>
            {loading && (
              <div style={{
                position: 'absolute', top: '100px', left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', background: '#0f1117', zIndex: 10, gap: '16px',
              }}>
                <div style={{
                  width: '40px', height: '40px',
                  border: '3px solid rgba(16,185,129,0.2)', borderTopColor: '#10b981',
                  borderRadius: '50%', animation: 'spin 1s linear infinite',
                }} />
                <p style={{ color: '#64748b', fontSize: '13px' }}>Carregando Chatwoot CRM...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={dashboardUrl}
              onLoad={() => setLoading(false)}
              style={{
                flex: 1, width: '100%', border: 'none', background: '#0f1117',
              }}
              allow="camera; microphone; clipboard-write; clipboard-read"
            />
          </>
        )}
      </div>
    </AuthGuard>
  );
}
