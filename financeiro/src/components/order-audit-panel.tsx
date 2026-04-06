'use client';
import { useState, useEffect, useCallback } from 'react';

interface AuditEntry {
  id: string;
  orderId: string;
  approvalId: string | null;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  actorId: string | null;
  actorName: string;
  approverId: string | null;
  approverName: string | null;
  productName: string;
  batchNumber: number | null;
  unit: string | null;
  createdAt: string;
}

const ACTION_MAP: Record<string, { label: string; icon: string; color: string }> = {
  pedido_criado: { label: 'Pedido Criado', icon: 'add_circle', color: '#10b981' },
  solicitacao_criada: { label: 'Solicitação Criada', icon: 'pending', color: '#f59e0b' },
  alteracao_aprovada: { label: 'Alteração Aprovada', icon: 'check_circle', color: '#22c55e' },
  alteracao_recusada: { label: 'Alteração Recusada', icon: 'cancel', color: '#ef4444' },
  alteracao_direta: { label: 'Alteração Direta', icon: 'bolt', color: '#2563eb' },
  pedido_excluido: { label: 'Pedido Excluído', icon: 'delete', color: '#ef4444' },
  historico_excluido: { label: 'Histórico Excluído', icon: 'delete_sweep', color: '#94a3b8' },
};

const FIELD_LABELS: Record<string, string> = {
  productName: 'Produto', quantity: 'Quantidade', urgency: 'Urgência',
  status: 'Status', notes: 'Observação', unitPrice: 'Preço Unitário',
  totalPrice: 'Preço Total', unit: 'Unidade', estimatedArrival: 'Previsão',
  sourceUrl: 'URL do Produto',
};

function getUserInfo() {
  try {
    const stored = localStorage.getItem('virtuosa_user');
    if (stored) {
      const user = JSON.parse(stored);
      return { userName: user.name || 'Admin', userId: user.id || '' };
    }
  } catch {}
  return { userName: 'Admin', userId: '' };
}

function getUserPermissions() {
  try {
    const stored = localStorage.getItem('virtuosa_user');
    if (stored) {
      const user = JSON.parse(stored);
      const perms = user.permissions || {};
      return {
        canDelete: perms.admin === true || perms.pedidosExcluirHistorico === true,
      };
    }
  } catch {}
  return { canDelete: false };
}

interface Props {
  canDelete?: boolean;
}

export function OrderAuditPanel({ canDelete: canDeleteProp }: Props) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { canDelete } = getUserPermissions();
  const showDelete = canDeleteProp !== undefined ? canDeleteProp : canDelete;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { userId } = getUserInfo();
    const params = new URLSearchParams();
    params.append('userId', userId);
    params.append('page', String(page));
    params.append('limit', '30');
    if (filterAction) params.append('action', filterAction);
    if (filterSearch) params.append('search', filterSearch);
    if (filterDateFrom) params.append('dateFrom', filterDateFrom);
    if (filterDateTo) params.append('dateTo', filterDateTo);

    try {
      const res = await fetch(`/api/orders/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else if (res.status === 403) {
        setLogs([]);
        setTotal(0);
      }
    } catch (err) { console.error('Fetch audit error:', err); }
    finally { setLoading(false); }
  }, [page, filterAction, filterSearch, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (isExpanded) fetchLogs();
  }, [isExpanded, fetchLogs]);

  const handleDelete = async (logId: string) => {
    const { userName, userId } = getUserInfo();
    try {
      const res = await fetch('/api/orders/audit', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, userId, userName }),
      });
      if (res.ok) {
        setLogs(prev => prev.filter(l => l.id !== logId));
        setDeleteConfirm(null);
      }
    } catch (err) { console.error('Delete audit error:', err); }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const unitColors: Record<string, string> = { Barueri: '#8b5cf6', Osasco: '#f59e0b', SBC: '#10b981', SCS: '#ef4444' };

  return (
    <section style={{ marginBottom: 20 }}>
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: isExpanded ? '14px 14px 0 0' : 14,
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          transition: 'all 0.2s',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>history</span>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Histórico de Alterações
            {total > 0 && (
              <span style={{
                marginLeft: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 22, height: 22, borderRadius: 11, background: '#6366f1', color: '#fff',
                fontSize: '0.72rem', fontWeight: 900, padding: '0 6px',
              }}>{total}</span>
            )}
          </h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Registro completo e imutável de todas as alterações em pedidos
          </p>
        </div>
        <span className="material-symbols-outlined" style={{
          fontSize: 20, color: 'var(--text-muted)', transition: 'transform 0.3s',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
        }}>expand_more</span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderTop: 'none',
          borderRadius: '0 0 14px 14px', padding: '16px 18px',
        }}>
          {/* Filters Row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 600 }}>
              <option value="">Todas as ações</option>
              {Object.entries(ACTION_MAP).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <input placeholder="Buscar produto..." value={filterSearch} onChange={e => { setFilterSearch(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 600, width: 150 }} />
            <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 600 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>até</span>
            <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 600 }} />
            {(filterAction || filterSearch || filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterAction(''); setFilterSearch(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>Limpar
              </button>
            )}
          </div>

          {/* Logs */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined spinning" style={{ fontSize: 24 }}>progress_activity</span>
              <p style={{ margin: '8px 0 0', fontWeight: 600, fontSize: '0.85rem' }}>Carregando histórico...</p>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28 }}>inbox</span>
              <p style={{ margin: '8px 0 0', fontWeight: 600, fontSize: '0.85rem' }}>Nenhum registro encontrado</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logs.map(log => {
                const actionInfo = ACTION_MAP[log.action] || { label: log.action, icon: 'info', color: '#64748b' };
                const uColor = unitColors[log.unit || ''] || '#64748b';

                return (
                  <div key={log.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                    background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)',
                    borderLeft: `3px solid ${actionInfo.color}`, position: 'relative',
                    transition: 'all 0.15s',
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, background: `${actionInfo.color}12`, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: actionInfo.color }}>{actionInfo.icon}</span>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>{log.productName}</span>
                        {log.unit && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 800, background: `${uColor}12`, color: uColor }}>{log.unit}</span>}
                        {log.batchNumber && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--card-bg)' }}>Lote #{log.batchNumber}</span>}
                        <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 800, background: `${actionInfo.color}12`, color: actionInfo.color }}>{actionInfo.label}</span>
                      </div>

                      {/* Field change detail */}
                      {log.field && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{FIELD_LABELS[log.field] || log.field}:</span>
                          {log.oldValue && <span style={{ padding: '1px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: '0.75rem', textDecoration: 'line-through' }}>{log.oldValue}</span>}
                          <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-muted)' }}>arrow_forward</span>
                          <span style={{ padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: '0.75rem' }}>{log.newValue || '—'}</span>
                        </div>
                      )}

                      {/* Reason */}
                      {log.reason && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, fontSize: '0.75rem', color: '#6366f1' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>comment</span>
                          <span style={{ fontWeight: 600, fontStyle: 'italic' }}>{log.reason}</span>
                        </div>
                      )}

                      {/* Meta row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person</span>
                          <span style={{ fontWeight: 700 }}>{log.actorName}</span>
                        </span>
                        {log.approverName && (
                          <>
                            <span>·</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>verified</span>
                              <span style={{ fontWeight: 700 }}>{log.approverName}</span>
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Delete button */}
                    {showDelete && (
                      <button
                        onClick={() => setDeleteConfirm(log.id)}
                        title="Excluir registro"
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: 'none',
                          background: 'transparent', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          opacity: 0.4, transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: page === 1 ? 'var(--bg)' : 'var(--card-bg)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', color: 'var(--text-muted)' }}>
                ← Anterior
              </button>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                {page} / {totalPages} ({total} registros)
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: page >= totalPages ? 'var(--bg)' : 'var(--card-bg)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', color: 'var(--text-muted)' }}>
                Próxima →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 20, padding: 28, maxWidth: 380, width: '90%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#ef4444', marginBottom: 12 }}>delete_sweep</span>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>Excluir Registro</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20 }}>
              Tem certeza? O registro será marcado como excluído, mas a exclusão será registrada no histórico.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)' }}>Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)}
                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spinning { to { transform: rotate(360deg) } } .spinning { animation: spinning 1s linear infinite; }`}</style>
    </section>
  );
}
