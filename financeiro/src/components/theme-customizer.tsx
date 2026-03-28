'use client';
import React, { useState, useEffect } from 'react';

export function ThemeCustomizer() {
  const [isOpen, setIsOpen] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#e6007e');

  const PRESETS = [
    { name: 'Virtuosa', color: '#e6007e' },
    { name: 'Índigo', color: '#6366f1' },
    { name: 'Esmeralda', color: '#10b981' },
    { name: 'Azul', color: '#3b82f6' },
    { name: 'Roxo', color: '#8b5cf6' },
    { name: 'Rosa', color: '#ec4899' },
    { name: 'Laranja', color: '#f97316' },
    { name: 'Vermelho', color: '#ef4444' },
  ];

  useEffect(() => {
    const saved = localStorage.getItem('virtuosa_primary_color');
    if (saved) { setPrimaryColor(saved); applyColor(saved); }
  }, []);

  const applyColor = (color: string) => {
    document.documentElement.style.setProperty('--primary', color);
    // Generate lighter/darker variants
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    document.documentElement.style.setProperty('--primary-light', `rgba(${r},${g},${b},0.1)`);
    document.documentElement.style.setProperty('--primary-dark', `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)})`);
  };

  const handleColorChange = (color: string) => {
    setPrimaryColor(color);
    applyColor(color);
    localStorage.setItem('virtuosa_primary_color', color);
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} title="Personalizar tema"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 10, transition: 'background 0.15s', display: 'flex', alignItems: 'center' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>palette</span>
      </button>

      {isOpen && (
        <div onClick={() => setIsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'fixed', top: 60, right: 16, width: 280,
            background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 18,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '20px 22px', zIndex: 10000,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: primaryColor }}>palette</span>
              <span style={{ fontSize: '0.92rem', fontWeight: 800 }}>Tema</span>
            </div>

            {/* Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {PRESETS.map(p => (
                <button key={p.name} onClick={() => handleColorChange(p.color)} title={p.name}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 12, border: primaryColor === p.color ? '3px solid var(--text-main)' : '2px solid transparent',
                    background: p.color, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {primaryColor === p.color && <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>check</span>}
                </button>
              ))}
            </div>

            {/* Custom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>COR CUSTOM</label>
              <input type="color" value={primaryColor} onChange={e => handleColorChange(e.target.value)}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{primaryColor}</span>
            </div>

            {/* Reset */}
            <button onClick={() => handleColorChange('#e6007e')}
              style={{ width: '100%', marginTop: 12, padding: '8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>
              Restaurar padrão
            </button>
          </div>
        </div>
      )}
    </>
  );
}
