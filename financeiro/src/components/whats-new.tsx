'use client';
import { useState, useEffect } from 'react';

/*
 * ══════════════════════════════════════════════════════
 *  CHANGELOG — Adicione novas versões no topo do array.
 *  Quando uma nova versão é adicionada, o popup aparece
 *  automaticamente para usuários que ainda não viram.
 * ══════════════════════════════════════════════════════
 */
interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: { icon: string; text: string; tag?: string }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.3.0',
    date: '18/03/2026',
    title: '🚀 Reembolsos & Chat IA',
    items: [
      { icon: 'receipt_long', text: 'Nova seção de Reembolsos no Financeiro com classificação por IA', tag: 'Novo' },
      { icon: 'smart_toy', text: 'Chat com IA nos Insumos — envie arquivos diretamente na conversa', tag: 'Novo' },
      { icon: 'unfold_less', text: 'Tabela de salários agora é expansível/retrátil', tag: 'Melhoria' },
      { icon: 'inventory_2', text: 'Aba Insumos com upload de PDF/fotos e extração por IA', tag: 'Novo' },
    ],
  },
  {
    version: '2.2.0',
    date: '17/03/2026',
    title: '⚡ Refatoração & Performance',
    items: [
      { icon: 'code', text: 'Código refatorado: arquivos 73% menores com hooks e sub-componentes', tag: 'Melhoria' },
      { icon: 'shopping_cart', text: 'Cotação de preços automática no Mercado Livre para pedidos', tag: 'Novo' },
      { icon: 'history', text: 'Histórico de pedidos com sugestões automáticas', tag: 'Novo' },
    ],
  },
];

const STORAGE_KEY = 'virtuosa_last_seen_version';

const tagColors: Record<string, { bg: string; color: string }> = {
  'Novo': { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  'Melhoria': { bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
  'Correção': { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
};

export function WhatsNew() {
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Only run on client, after login
    if (typeof window === 'undefined') return;
    const user = localStorage.getItem('virtuosa_user');
    if (!user) return;

    const lastSeen = localStorage.getItem(STORAGE_KEY);
    const latestVersion = CHANGELOG[0]?.version;
    if (!latestVersion) return;

    if (lastSeen !== latestVersion) {
      // Small delay so the page loads first
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, CHANGELOG[0].version);
  };

  if (!visible || CHANGELOG.length === 0) return null;

  const entry = CHANGELOG[currentIndex];

  return (
    <>
      {/* Backdrop */}
      <div onClick={dismiss} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.3s ease',
      }}>
        {/* Modal */}
        <div onClick={e => e.stopPropagation()} style={{
          background: '#fff', borderRadius: 24, width: '90%', maxWidth: 480,
          boxShadow: '0 24px 80px rgba(0,0,0,0.2)', overflow: 'hidden',
          animation: 'slideUp 0.4s ease',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
            padding: '28px 28px 20px', color: '#fff', textAlign: 'center', position: 'relative',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✨</div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Novidades!</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', opacity: 0.85 }}>Confira o que há de novo no sistema</p>
            <button onClick={dismiss} style={{
              position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 10,
              border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>

          {/* Version tabs */}
          {CHANGELOG.length > 1 && (
            <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', background: 'rgba(249,250,251,0.8)' }}>
              {CHANGELOG.map((c, i) => (
                <button key={c.version} onClick={() => setCurrentIndex(i)} style={{
                  padding: '6px 14px', borderRadius: '10px 10px 0 0', border: 'none',
                  background: i === currentIndex ? '#fff' : 'transparent',
                  fontWeight: i === currentIndex ? 800 : 600, fontSize: '0.78rem',
                  color: i === currentIndex ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  borderBottom: i === currentIndex ? '2px solid var(--primary)' : '2px solid transparent',
                }}>
                  v{c.version}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div style={{ padding: '20px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{entry.title}</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{entry.date}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entry.items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 14px', borderRadius: 14,
                  background: 'rgba(249,250,251,0.8)', border: '1px solid var(--border)',
                  transition: 'all 0.2s',
                }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: 22, color: 'var(--primary)', flexShrink: 0, marginTop: 1,
                  }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, lineHeight: 1.4 }}>{item.text}</span>
                  </div>
                  {item.tag && (
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                      flexShrink: 0, ...(tagColors[item.tag] || tagColors['Novo']),
                    }}>{item.tag}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '0 28px 24px', textAlign: 'center' }}>
            <button onClick={dismiss} style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
              color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
              fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(230,0,126,0.25)',
            }}>
              Entendi! 🎉
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px) scale(0.95) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>
  );
}
