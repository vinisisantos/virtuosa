'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const SHORTCUTS = [
  { keys: ['Ctrl', 'N'], desc: 'Novo agendamento', action: 'newAppointment' },
  { keys: ['Ctrl', 'K'], desc: 'Buscar', action: 'search' },
  { keys: ['Ctrl', 'D'], desc: 'Dashboard', action: 'dashboard' },
  { keys: ['Ctrl', 'E'], desc: 'Estoque', action: 'estoque' },
  { keys: ['Ctrl', 'L'], desc: 'CRM Clientes', action: 'clientes' },
  { keys: ['Ctrl', 'Shift', 'A'], desc: 'Agenda', action: 'agenda' },
  { keys: ['?'], desc: 'Mostrar atalhos', action: 'help' },
  { keys: ['Esc'], desc: 'Fechar modal', action: 'close' },
];

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === '?' && !e.ctrlKey) { setShowHelp(v => !v); return; }
    if (e.key === 'Escape') { setShowHelp(false); return; }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); router.push('/agenda'); return; }
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); const search = document.querySelector<HTMLInputElement>('input[placeholder*="Buscar"]'); search?.focus(); return; }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); router.push('/dashboard'); return; }
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); router.push('/estoque'); return; }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); router.push('/clientes'); return; }
    if (e.ctrlKey && e.shiftKey && e.key === 'A') { e.preventDefault(); router.push('/agenda'); return; }
  }, [router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!showHelp) return null;

  return (
    <div onClick={() => setShowHelp(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: '28px 32px', maxWidth: 420, width: '90%', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>keyboard</span>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Atalhos de Teclado</h2>
          </div>
          <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SHORTCUTS.map(s => (
            <div key={s.action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>{s.desc}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {s.keys.map(k => (
                  <kbd key={k} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Pressione <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', fontWeight: 800, fontFamily: 'monospace' }}>?</kbd> para abrir/fechar
        </div>
      </div>
    </div>
  );
}
