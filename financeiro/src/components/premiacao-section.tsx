'use client';
import { useState, useEffect, useCallback } from 'react';

interface UserInfo { id: string; name: string; role: string; unit?: string; }
interface SellerBonus {
  sellerName: string;
  role: string;
  totalSales: number;
  autoPercent: number;
  manualPercent: number | null; // null = auto
  bonusValue: number;
}

const STORAGE_KEY_LOGS = 'virtuosa_finance_logs_v2';
const STORAGE_KEY_PREMIACOES = 'virtuosa_premiacoes_manual';

const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', backdropFilter: 'blur(20px)', borderRadius: 20,
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: 24,
};
const thS: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontWeight: 800, color: 'var(--text-muted)',
  fontSize: '0.72rem', textTransform: 'uppercase',
};

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getAutoPercentage(role: string, totalSales: number): number {
  const r = role.toUpperCase();
  if (r === 'GERENTE') return 1;
  if (r === 'VENDEDOR' || r === 'VENDEDORA') {
    return totalSales > 50000 ? 2 : 1;
  }
  if (r === 'ESTETICISTA') return 1;
  return 1; // default
}

export function PremiacaoSection({ selectedUnit = 'all', selectedMonth, selectedYear }: {
  selectedUnit?: string;
  selectedMonth: number;
  selectedYear: number;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('virtuosa_premiacao_collapsed') === 'true';
    return false;
  });
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [bonuses, setBonuses] = useState<SellerBonus[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_PREMIACOES);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {};
  });
  const [editingName, setEditingName] = useState<string | null>(null);

  // Persist manual overrides
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREMIACOES, JSON.stringify(manualOverrides));
  }, [manualOverrides]);

  // Fetch users
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setUsers(data);
    }).catch(() => {});
  }, []);

  // Calculate bonuses from sales logs
  const calculateBonuses = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LOGS);
      const logs: any[] = raw ? JSON.parse(raw) : [];

      // Filter to sales in selected month/year/unit
      const sales = logs.filter((l: any) => {
        if (l.type !== 'sale' || !l.date) return false;
        const d = new Date(l.date);
        return d.getUTCMonth() === selectedMonth &&
               d.getUTCFullYear() === selectedYear &&
               (selectedUnit === 'all' || (l.unit || '') === selectedUnit);
      });

      // Aggregate by SELLER (vendedor), not by client name
      const sellerTotals: Record<string, number> = {};
      sales.forEach((s: any) => {
        // Try the dedicated seller field first, then parse from obs
        let seller = (s.seller || '').trim();
        if (!seller && s.obs) {
          // Parse seller from obs field: look for 👤SellerName pattern
          const sellerMatch = (s.obs as string).match(/👤\s*([^|]+)/);
          if (sellerMatch) seller = sellerMatch[1].trim();
        }
        if (!seller) return; // skip entries without a seller
        sellerTotals[seller] = (sellerTotals[seller] || 0) + s.value;
      });

      // Build bonus list
      const result: SellerBonus[] = Object.entries(sellerTotals)
        .map(([sellerName, totalSales]) => {
          // Find user role
          const user = users.find(u => u.name.toLowerCase().trim() === sellerName.toLowerCase().trim());
          const role = user?.role || 'VENDEDOR';
          const autoPercent = getAutoPercentage(role, totalSales);
          const manualPercent = manualOverrides[sellerName] ?? null;
          const effectivePercent = manualPercent !== null ? manualPercent : autoPercent;
          const bonusValue = totalSales * (effectivePercent / 100);

          return { sellerName, role, totalSales, autoPercent, manualPercent, bonusValue };
        })
        .sort((a, b) => a.sellerName.localeCompare(b.sellerName));

      setBonuses(result);
    } catch (err) { console.error('calc bonuses error:', err); }
  }, [users, manualOverrides, selectedMonth, selectedYear, selectedUnit]);

  useEffect(() => { calculateBonuses(); }, [calculateBonuses]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('virtuosa_premiacao_collapsed', String(next));
      return next;
    });
  };

  const handleSetManualPercent = (sellerName: string, percent: number | null) => {
    setManualOverrides(prev => {
      const next = { ...prev };
      if (percent === null) {
        delete next[sellerName];
      } else {
        next[sellerName] = Math.min(Math.max(percent, 0), 3);
      }
      return next;
    });
    setEditingName(null);
  };

  const totalBonus = bonuses.reduce((s, b) => s + b.bonusValue, 0);
  const totalSales = bonuses.reduce((s, b) => s + b.totalSales, 0);

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  return (
    <section style={{ marginTop: 40 }}>
      {/* Header */}
      <div onClick={toggleCollapsed} style={{ ...cardS, padding: '16px 24px', marginBottom: collapsed ? 0 : 20, cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-main)' }}>
          <span className="material-symbols-outlined" style={{ color: '#f59e0b', fontSize: 24 }}>emoji_events</span>
          Premiação por Colaborador
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {bonuses.length > 0 && (
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '4px 14px', borderRadius: 20 }}>
              {bonuses.length} colaborador{bonuses.length !== 1 ? 'es' : ''} • {formatBRL(totalBonus)}
            </span>
          )}
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)', transition: 'transform 0.3s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>expand_more</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: collapsed ? 0 : 8000, opacity: collapsed ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.4s ease, opacity 0.3s ease' }}>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <div style={{ ...cardS, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Vendas</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#6366f1' }}>{formatBRL(totalSales)}</div>
          </div>
          <div style={{ ...cardS, padding: 16, textAlign: 'center', border: '1px solid rgba(245,158,11,0.15)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Premiação</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f59e0b' }}>{formatBRL(totalBonus)}</div>
          </div>
          <div style={{ ...cardS, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Período</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{MONTHS[selectedMonth]} {selectedYear}</div>
          </div>
        </div>

        {/* Rules info */}
        <div style={{ ...cardS, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>info</span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-main)' }}>Regras automáticas:</strong>{' '}
            Gerente → 1% fixo | Vendedor(a) até R$ 50k → 1%, acima → 2% | Pode ser alterado manualmente até 3%.
          </div>
        </div>

        {/* Table */}
        <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
          {bonuses.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-muted)', opacity: 0.3 }}>emoji_events</span>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
                Nenhuma venda registrada para este período.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={thS}>Colaborador</th>
                    <th style={thS}>Cargo</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Total Vendido</th>
                    <th style={{ ...thS, textAlign: 'center' }}>% Aplicado</th>
                    <th style={{ ...thS, textAlign: 'center' }}>Origem</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Premiação</th>
                    <th style={{ ...thS, textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {bonuses.map(b => {
                    const isManual = b.manualPercent !== null;
                    const effectivePercent = isManual ? b.manualPercent! : b.autoPercent;
                    const isEditing = editingName === b.sellerName;
                    return (
                      <tr key={b.sellerName} style={{ borderBottom: '1px solid var(--border)', transition: 'all 0.2s' }}>
                        {/* Name */}
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-main)' }}>{b.sellerName}</td>
                        {/* Role */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                            background: b.role === 'GERENTE' ? 'rgba(168,85,247,0.1)' : b.role === 'ESTETICISTA' ? 'rgba(20,184,166,0.1)' : 'rgba(59,130,246,0.1)',
                            color: b.role === 'GERENTE' ? '#a855f7' : b.role === 'ESTETICISTA' ? '#14b8a6' : '#3b82f6',
                          }}>
                            {b.role === 'GERENTE' ? 'Gerente' : b.role === 'ESTETICISTA' ? 'Esteticista' : 'Vendedor(a)'}
                          </span>
                        </td>
                        {/* Total Sales */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#6366f1' }}>
                          {formatBRL(b.totalSales)}
                        </td>
                        {/* Percentage */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                              {[1, 2, 3].map(p => (
                                <button key={p} onClick={() => handleSetManualPercent(b.sellerName, p)} style={{
                                  width: 32, height: 32, borderRadius: 8, border: `2px solid ${effectivePercent === p ? '#f59e0b' : 'var(--border)'}`,
                                  background: effectivePercent === p ? 'rgba(245,158,11,0.15)' : 'transparent',
                                  fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                                  color: effectivePercent === p ? '#f59e0b' : 'var(--text-muted)',
                                }}>
                                  {p}%
                                </button>
                              ))}
                              {isManual && (
                                <button onClick={() => handleSetManualPercent(b.sellerName, null)} title="Voltar ao automático" style={{
                                  width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(107,114,128,0.2)',
                                  background: 'rgba(107,114,128,0.05)', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>undo</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span style={{
                              fontWeight: 900, fontSize: '1rem',
                              color: effectivePercent >= 3 ? '#ef4444' : effectivePercent >= 2 ? '#f59e0b' : '#10b981',
                            }}>
                              {effectivePercent}%
                            </span>
                          )}
                        </td>
                        {/* Origin */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                            background: isManual ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                            color: isManual ? '#f59e0b' : '#10b981',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                              {isManual ? 'edit' : 'auto_awesome'}
                            </span>
                            {isManual ? 'Manual' : 'Automático'}
                          </span>
                        </td>
                        {/* Bonus value */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, fontSize: '0.95rem', color: '#f59e0b' }}>
                          {formatBRL(b.bonusValue)}
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => setEditingName(isEditing ? null : b.sellerName)}
                            title={isEditing ? 'Fechar' : 'Alterar %'}
                            style={{
                              padding: '6px 12px', borderRadius: 8,
                              border: isEditing ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border)',
                              background: isEditing ? 'rgba(245,158,11,0.1)' : 'transparent',
                              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem',
                              color: isEditing ? '#f59e0b' : 'var(--text-muted)',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              {isEditing ? 'close' : 'tune'}
                            </span>
                            {isEditing ? 'Fechar' : 'Alterar %'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer total */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                    <td colSpan={2} style={{ padding: '14px 16px', fontWeight: 900, fontSize: '0.9rem', color: 'var(--text-main)' }}>TOTAL</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, fontSize: '0.9rem', color: '#6366f1' }}>{formatBRL(totalSales)}</td>
                    <td colSpan={2}></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, fontSize: '1rem', color: '#f59e0b' }}>{formatBRL(totalBonus)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
