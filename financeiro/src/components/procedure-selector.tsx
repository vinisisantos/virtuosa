'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface CatalogService {
  id: string;
  name: string;
  price: number;
  duration: number;
  category: string;
}

interface ProcedureSelectorProps {
  value: string;
  onChange: (name: string, price?: number) => void;
  services: CatalogService[];
  placeholder?: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const CATEGORY_ICONS: Record<string, string> = {
  'Facial': 'face_retouching_natural',
  'Corporal': 'self_improvement',
  'Capilar': 'content_cut',
  'Depilação': 'spa',
  'Estética': 'auto_awesome',
  'Injetáveis': 'vaccines',
  'Massagem': 'self_improvement',
  'Tratamento': 'healing',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Facial': '#6366f1',
  'Corporal': '#10b981',
  'Capilar': '#f59e0b',
  'Depilação': '#ec4899',
  'Estética': '#8b5cf6',
  'Injetáveis': '#ef4444',
  'Massagem': '#3b82f6',
  'Tratamento': '#14b8a6',
};

function getCategoryIcon(cat: string): string {
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (cat.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return 'spa';
}

function getCategoryColor(cat: string): string {
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (cat.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return 'var(--primary)';
}

export function ProcedureSelector({ value, onChange, services, placeholder = 'Buscar procedimento...' }: ProcedureSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync external value
  useEffect(() => { setSearch(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter and group services
  const query = search.toLowerCase().trim();
  const filtered = query
    ? services.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query)
      )
    : services;

  // Group by category
  const grouped = filtered.reduce<Record<string, CatalogService[]>>((acc, svc) => {
    const cat = svc.category || 'Outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(svc);
    return acc;
  }, {});

  const flatList = filtered; // for keyboard nav

  const selectService = useCallback((svc: CatalogService) => {
    setSearch(svc.name);
    onChange(svc.name, svc.price);
    setIsOpen(false);
    setHighlightIndex(-1);
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    onChange(e.target.value);
    if (!isOpen) setIsOpen(true);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev => Math.min(prev + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < flatList.length) {
          selectService(flatList[highlightIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-procedure-item]');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const isSelected = services.some(s => s.name === value);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Input */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}>
        <span className="material-symbols-outlined" style={{
          position: 'absolute', left: 10, fontSize: 16,
          color: isOpen ? 'var(--primary)' : 'var(--text-muted)',
          transition: 'color 0.2s',
          pointerEvents: 'none',
        }}>
          {isSelected ? 'check_circle' : 'search'}
        </span>
        <input
          ref={inputRef}
          value={search}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: '100%', padding: '10px 32px 10px 32px',
            borderRadius: 12, height: 42, fontSize: '0.82rem',
            border: isOpen ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text-main)',
            fontFamily: 'inherit', fontWeight: 600,
            outline: 'none', boxSizing: 'border-box' as const,
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: isOpen ? '0 0 0 3px var(--primary-light)' : 'none',
          }}
        />
        <span className="material-symbols-outlined" style={{
          position: 'absolute', right: 10, fontSize: 18,
          color: 'var(--text-muted)', pointerEvents: 'none',
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          expand_more
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            minWidth: 380, width: 'max(100%, 380px)',
            zIndex: 100, maxHeight: 320, overflowY: 'auto',
            background: 'var(--card-bg)',
            borderRadius: 14, border: '1px solid var(--border)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
            animation: 'procedureDropIn 0.15s ease-out',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: '24px 16px', textAlign: 'center',
              color: 'var(--text-muted)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, marginBottom: 6, display: 'block', opacity: 0.5 }}>search_off</span>
              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Nenhum procedimento encontrado
              </div>
              <div style={{ fontSize: '0.72rem', marginTop: 4 }}>
                Tente outro termo de busca
              </div>
            </div>
          ) : (
            <>
              {/* Results count */}
              <div style={{
                padding: '8px 14px', fontSize: '0.68rem', fontWeight: 700,
                color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.05em', borderBottom: '1px solid var(--border)',
                background: 'var(--bg)',
                position: 'sticky', top: 0, zIndex: 1,
                borderRadius: '14px 14px 0 0',
              }}>
                {filtered.length} procedimento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
              </div>

              {/* Grouped items */}
              {Object.entries(grouped).map(([category, items]) => {
                const catColor = getCategoryColor(category);
                const catIcon = getCategoryIcon(category);

                return (
                  <div key={category}>
                    {/* Category header */}
                    <div style={{
                      padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 7,
                      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                      position: 'sticky', top: 30, zIndex: 1,
                    }}>
                      <span className="material-symbols-outlined" style={{
                        fontSize: 15, color: catColor,
                      }}>{catIcon}</span>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 800, color: catColor,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>{category}</span>
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)',
                        background: 'var(--card-bg)', padding: '1px 6px', borderRadius: 8,
                        marginLeft: 'auto',
                      }}>{items.length}</span>
                    </div>

                    {/* Items */}
                    {items.map((svc) => {
                      const globalIdx = flatList.indexOf(svc);
                      const isHighlighted = globalIdx === highlightIndex;
                      const isCurrentValue = svc.name === value;

                      return (
                        <div
                          key={svc.id}
                          data-procedure-item
                          onMouseDown={(e) => { e.preventDefault(); selectService(svc); }}
                          onMouseEnter={() => setHighlightIndex(globalIdx)}
                          style={{
                            padding: '10px 14px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 10,
                            transition: 'background 0.1s',
                            background: isHighlighted
                              ? 'var(--bg)'
                              : isCurrentValue
                                ? 'rgba(230,0,126,0.03)'
                                : 'transparent',
                            borderBottom: '1px solid var(--border)',
                            borderLeft: isCurrentValue ? '3px solid var(--primary)' : '3px solid transparent',
                          }}
                        >
                          {/* Left icon */}
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: `${catColor}10`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span className="material-symbols-outlined" style={{
                              fontSize: 16, color: catColor,
                            }}>{catIcon}</span>
                          </div>

                          {/* Text */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '0.84rem', fontWeight: 700,
                              color: isCurrentValue ? 'var(--primary)' : 'var(--text-main)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {highlightMatch(svc.name, query)}
                            </div>
                            {svc.duration > 0 && (
                              <div style={{
                                fontSize: '0.68rem', color: 'var(--text-muted)',
                                fontWeight: 600, marginTop: 1,
                                display: 'flex', alignItems: 'center', gap: 3,
                              }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>schedule</span>
                                {svc.duration} min
                              </div>
                            )}
                          </div>

                          {/* Price */}
                          <div style={{
                            fontSize: '0.82rem', fontWeight: 800, flexShrink: 0,
                            color: svc.price > 0 ? '#10b981' : 'var(--text-muted)',
                            background: svc.price > 0 ? 'rgba(16,185,129,0.06)' : 'transparent',
                            padding: '3px 8px', borderRadius: 8,
                          }}>
                            {svc.price > 0 ? fmt(svc.price) : '—'}
                          </div>

                          {/* Selected check */}
                          {isCurrentValue && (
                            <span className="material-symbols-outlined" style={{
                              fontSize: 16, color: 'var(--primary)', flexShrink: 0,
                            }}>check</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes procedureDropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Highlights matching substring in bold */
function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: 'var(--primary)', fontWeight: 900 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}
