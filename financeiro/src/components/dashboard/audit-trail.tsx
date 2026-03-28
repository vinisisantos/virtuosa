'use client';
import React, { useState, useEffect } from 'react';
import { cardS } from '@/hooks/useDashboard';

interface AuditEntry {
  id: string; userName: string; action: string; entity: string;
  entityId: string; details: string; createdAt: string;
}

const ACTION_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  create: { bg: 'rgba(16,185,129,0.08)', color: '#10b981', icon: 'add_circle' },
  update: { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6', icon: 'edit' },
  delete: { bg: 'rgba(239,68,68,0.08)', color: '#ef4444', icon: 'delete' },
  login: { bg: 'rgba(99,102,241,0.08)', color: '#6366f1', icon: 'login' },
  status: { bg: 'rgba(245,158,11,0.08)', color: '#f59e0b', icon: 'swap_horiz' },
};

export function AuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  useEffect(() => {
    fetch('/api/audit').then(r => r.json()).then(data => {
      setEntries(data.entries || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Group entries by date
  const filtered = entries.filter(e => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (entityFilter && e.entity !== entityFilter) return false;
    return true;
  });

  const grouped: Record<string, AuditEntry[]> = {};
  filtered.forEach(e => {
    const d = new Date(e.createdAt).toLocaleDateString('pt-BR');
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  });

  const actions = [...new Set(entries.map(e => e.action))];
  const entities = [...new Set(entries.map(e => e.entity))];

  const selectS: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.82rem', fontWeight: 600, background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit', outline: 'none' };

  if (loading) return <div style={cardS}><div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando auditoria...</div></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { icon: 'history', color: '#6366f1', label: 'Total Registros', value: String(entries.length) },
          { icon: 'add_circle', color: '#10b981', label: 'Criações', value: String(entries.filter(e => e.action === 'create').length) },
          { icon: 'edit', color: '#3b82f6', label: 'Edições', value: String(entries.filter(e => e.action === 'update').length) },
          { icon: 'delete', color: '#ef4444', label: 'Exclusões', value: String(entries.filter(e => e.action === 'delete').length) },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardS, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={selectS}>
          <option value="">Todas Ações</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={selectS}>
          <option value="">Todas Entidades</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        {(actionFilter || entityFilter) && (
          <button onClick={() => { setActionFilter(''); setEntityFilter(''); }} style={{ ...selectS, cursor: 'pointer', color: 'var(--primary)', border: '1px solid var(--primary)' }}>Limpar Filtros</button>
        )}
      </div>

      {/* Timeline */}
      {Object.keys(grouped).length === 0 ? (
        <div style={{ ...cardS, textAlign: 'center', padding: '40px 0' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.3, color: 'var(--text-muted)' }}>receipt_long</span>
          <p style={{ fontSize: '0.85rem', marginTop: 8, color: 'var(--text-muted)' }}>Nenhum registro de auditoria</p>
        </div>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span> {date}
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--primary)' }}>({items.length})</span>
          </div>
          <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
            {items.map((e, i) => {
              const config = ACTION_COLORS[e.action] || ACTION_COLORS.update;
              const time = new Date(e.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: config.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: config.color }}>{config.icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{e.details}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: config.color, padding: '1px 6px', borderRadius: 4, background: config.bg }}>{e.action}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{e.entity}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>por {e.userName}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{time}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
