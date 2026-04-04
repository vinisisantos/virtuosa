'use client';

import { useState, useRef, useEffect } from 'react';

/* ─── Category metadata ─── */
const CAT_META: Record<string, { icon: string; color: string; gradient: string }> = {
  'Aluguel':        { icon: 'home',               color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
  'Salários':       { icon: 'badge',              color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
  'Produtos':       { icon: 'inventory_2',        color: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #fb923c)' },
  'Internet':       { icon: 'wifi',               color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
  'Luz':            { icon: 'bolt',               color: '#eab308', gradient: 'linear-gradient(135deg, #eab308, #facc15)' },
  'Impostos':       { icon: 'account_balance',    color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #f87171)' },
  'Fornecedores':   { icon: 'local_shipping',     color: '#14b8a6', gradient: 'linear-gradient(135deg, #14b8a6, #2dd4bf)' },
  'Marketing':      { icon: 'campaign',           color: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)' },
  'Segurança':      { icon: 'security',           color: '#0ea5e9', gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' },
  'Sistema':        { icon: 'computer',           color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)' },
  'Contabilidade':  { icon: 'calculate',          color: '#84cc16', gradient: 'linear-gradient(135deg, #84cc16, #a3e635)' },
  'Royalties':      { icon: 'license',            color: '#d946ef', gradient: 'linear-gradient(135deg, #d946ef, #e879f9)' },
  'Água':           { icon: 'water_drop',         color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #67e8f9)' },
  'Parcela':        { icon: 'credit_card',        color: '#e11d48', gradient: 'linear-gradient(135deg, #e11d48, #fb7185)' },
  'Equipamentos':   { icon: 'construction',       color: '#78716c', gradient: 'linear-gradient(135deg, #78716c, #a8a29e)' },
  'Serviços':       { icon: 'handyman',           color: '#0d9488', gradient: 'linear-gradient(135deg, #0d9488, #2dd4bf)' },
  'Outros':         { icon: 'more_horiz',         color: '#6b7280', gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)' },
};

function getCatMeta(cat: string) {
  return CAT_META[cat] || { icon: 'category', color: '#6b7280', gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)' };
}

interface CategorySelectorProps {
  value: string;
  onChange: (val: string) => void;
  categories: string[];
  accentColor?: string;
}

export function CategorySelector({ value, onChange, categories, accentColor = 'var(--primary)' }: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedMeta = getCatMeta(value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectCategory = (cat: string) => {
    onChange(cat);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', height: 46, padding: '0 14px',
          borderRadius: 12, cursor: 'pointer',
          border: isOpen ? `2px solid ${accentColor}` : '1px solid var(--border)',
          background: 'var(--bg)', color: 'var(--text-main)',
          fontFamily: 'inherit', fontWeight: 700, fontSize: '0.84rem',
          display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 0.2s',
          boxShadow: isOpen ? `0 0 0 3px ${accentColor}18` : 'none',
          boxSizing: 'border-box' as const,
        }}
      >
        {/* Selected category icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: selectedMeta.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 2px 8px ${selectedMeta.color}30`,
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 14, color: '#fff',
          }}>{selectedMeta.icon}</span>
        </div>

        {/* Label */}
        <span style={{ flex: 1, textAlign: 'left' }}>{value}</span>

        {/* Chevron */}
        <span className="material-symbols-outlined" style={{
          fontSize: 18, color: 'var(--text-muted)',
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>expand_more</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          width: '100%', minWidth: 260,
          zIndex: 200, maxHeight: 340, overflowY: 'auto',
          background: 'var(--card-bg)', borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
          padding: '6px',
          animation: 'catDropIn 0.18s ease-out',
        }}>
          {/* Grid of categories */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 4,
          }}>
            {categories.map(cat => {
              const meta = getCatMeta(cat);
              const isSelected = cat === value;

              return (
                <button
                  key={cat}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectCategory(cat); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 12, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                    background: isSelected
                      ? `${meta.color}15`
                      : 'transparent',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg)';
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: isSelected ? meta.gradient : `${meta.color}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isSelected ? `0 3px 10px ${meta.color}30` : 'none',
                    transition: 'all 0.2s',
                  }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 16,
                      color: isSelected ? '#fff' : meta.color,
                    }}>{meta.icon}</span>
                  </div>

                  {/* Label */}
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 800 : 600,
                    color: isSelected ? meta.color : 'var(--text-main)',
                    flex: 1, textAlign: 'left',
                  }}>{cat}</span>

                  {/* Selected check */}
                  {isSelected && (
                    <span className="material-symbols-outlined" style={{
                      fontSize: 16, color: meta.color, flexShrink: 0,
                    }}>check_circle</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes catDropIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
