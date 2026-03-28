'use client';
import React, { useState, useEffect } from 'react';
import { Skeleton, SkeletonTable } from '@/components/skeleton';

const ACTION_LABELS: Record<string, string> = {
  login: 'Login', create: 'Criação', update: 'Edição', delete: 'Exclusão',
  export: 'Exportação', import: 'Importação', view: 'Visualização',
};

const ENTITY_LABELS: Record<string, string> = {
  sale: 'Venda', cost: 'Custo', user: 'Usuário', order: 'Pedido',
  agendamento: 'Agendamento', backup: 'Backup', payroll: 'Folha',
  termos: 'Termos', cancelamento: 'Cancelamento', system: 'Sistema',
};

const ACTION_COLORS: Record<string, string> = {
  login: '#3b82f6', create: '#10b981', update: '#f59e0b', delete: '#ef4444',
  export: '#6366f1', import: '#8b5cf6', view: '#64748b',
};

const ACTION_ICONS: Record<string, string> = {
  login: 'login', create: 'add_circle', update: 'edit', delete: 'delete',
  export: 'download', import: 'upload', view: 'visibility',
};

interface ActivityLog {
  id: string; userId: string | null; userName: string;
  action: string; entityType: string; entityId: string | null;
  description: string; metadata: string | null; unit: string | null;
  createdAt: string;
}

const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };

export function ActivityLogViewer() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '30' });
      if (filterEntity) params.set('entityType', filterEntity);
      if (filterAction) params.set('action', filterAction);
      const res = await fetch(`/api/activity-log?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(1); setPage(1); }, [filterEntity, filterAction]);
  useEffect(() => { fetchLogs(); }, [page]);

  const selectS: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit' };

  return (
    <div style={cardS}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>history</span>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', flex: 1 }}>Log de Atividades</h2>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg)', padding: '4px 10px', borderRadius: 8 }}>{total} registros</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={selectS}>
          <option value="">Todas as entidades</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selectS}>
          <option value="">Todas as ações</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? <SkeletonTable rows={5} /> : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3 }}>history</span>
          <p style={{ fontWeight: 600, marginTop: 8 }}>Nenhuma atividade registrada</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {logs.map(log => {
            const color = ACTION_COLORS[log.action] || '#64748b';
            const icon = ACTION_ICONS[log.action] || 'info';
            const timeAgo = getTimeAgo(log.createdAt);
            return (
              <div key={log.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 12, transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color }}>{icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.description}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color }}>{ACTION_LABELS[log.action] || log.action}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>• {ENTITY_LABELS[log.entityType] || log.entityType}</span>
                    {log.unit && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>• {log.unit}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-main)' }}>{log.userName}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{timeAgo}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 30 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'inherit', opacity: page <= 1 ? 0.4 : 1 }}>← Anterior</button>
          <span style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Página {page} de {Math.ceil(total / 30)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 30 >= total} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: page * 30 >= total ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'inherit', opacity: page * 30 >= total ? 0.4 : 1 }}>Próxima →</button>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
