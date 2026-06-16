'use client';
import { useState, useEffect, useCallback } from 'react';

interface ApprovalOrder {
  id: string;
  productName: string;
  quantity: number;
  status: string;
  urgency: string;
  unit: string | null;
  batchNumber: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

interface Approval {
  id: string;
  orderId: string;
  requesterId: string | null;
  requesterName: string;
  changeType: string;
  changeData: Record<string, any>;
  description: string;
  reason: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  order: ApprovalOrder | null;
}

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

const FIELD_LABELS: Record<string, string> = {
  productName: 'Produto', quantity: 'Quantidade', urgency: 'Urgência',
  status: 'Status', notes: 'Observação', unitPrice: 'Preço Unitário',
  totalPrice: 'Preço Total', unit: 'Unidade', estimatedArrival: 'Previsão',
  sourceUrl: 'URL do Produto',
};

export function OrderApprovalPanel() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Approval[]>([]);
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({});

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/approvals?status=pendente');
      if (res.ok) setApprovals(await res.json());
    } catch (err) { console.error('Fetch approvals error:', err); }
    finally { setLoading(false); }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const [approvedRes, rejectedRes, directRes] = await Promise.all([
        fetch('/api/orders/approvals?status=aprovado'),
        fetch('/api/orders/approvals?status=recusado'),
        fetch('/api/orders/approvals?status=direto'),
      ]);
      const approved = approvedRes.ok ? await approvedRes.json() : [];
      const rejected = rejectedRes.ok ? await rejectedRes.json() : [];
      const direct = directRes.ok ? await directRes.json() : [];
      const all = [...approved, ...rejected, ...direct].sort((a: Approval, b: Approval) =>
        new Date(b.reviewedAt || b.createdAt).getTime() - new Date(a.reviewedAt || a.createdAt).getTime()
      );
      setHistory(all);
    } catch {}
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const handleAction = async (approvalId: string, action: 'aprovar' | 'recusar') => {
    setProcessing(approvalId);
    const { userName, userId } = getUserInfo();
    const reason = reasonInputs[approvalId] || '';
    try {
      const res = await fetch('/api/orders/approvals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, action, userId, userName, reason }),
      });
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== approvalId));
        setReasonInputs(prev => { const n = { ...prev }; delete n[approvalId]; return n; });
        window.dispatchEvent(new CustomEvent('virtuosa-orders-refresh'));
      }
    } catch (err) { console.error('Action error:', err); }
    finally { setProcessing(null); }
  };

  const pendingCount = approvals.length;
  if (loading) return null;

  const unitColors: Record<string, string> = {  Osasco: '#f59e0b', SBC: '#10b981', SCS: '#ef4444' };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const renderChanges = (approval: Approval) => {
    const { changeData, order } = approval;
    const items: { label: string; from: string; to: string }[] = [];

    for (const [key, newVal] of Object.entries(changeData)) {
      if (order && key in order) {
        const oldVal = (order as any)[key];
        const label = FIELD_LABELS[key] || key;
        items.push({ label, from: oldVal != null ? String(oldVal) : '—', to: newVal != null ? String(newVal) : '—' });
      }
    }

    if (items.length === 0) return <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{approval.description}</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 80 }}>{item.label}:</span>
            <span style={{ padding: '1px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: '0.78rem', textDecoration: 'line-through' }}>{item.from}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>arrow_forward</span>
            <span style={{ padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: '0.78rem' }}>{item.to}</span>
          </div>
        ))}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string; icon: string }> = {
      aprovado: { bg: '#dcfce7', color: '#16a34a', label: 'Aprovado', icon: 'check_circle' },
      recusado: { bg: '#fee2e2', color: '#dc2626', label: 'Recusado', icon: 'cancel' },
      direto: { bg: '#dbeafe', color: '#2563eb', label: 'Aplicado Direto', icon: 'bolt' },
    };
    return map[status] || { bg: '#fef3c7', color: '#f59e0b', label: status, icon: 'help' };
  };

  return (
    <section style={{ marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: pendingCount > 0 ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: pendingCount > 0 ? '#fff' : 'var(--text-muted)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>approval</span>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Aprovações Pendentes
              {pendingCount > 0 && (
                <span style={{
                  marginLeft: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%', background: '#ef4444', color: '#fff',
                  fontSize: '0.72rem', fontWeight: 900, animation: 'pulse 2s infinite',
                }}>{pendingCount}</span>
              )}
            </h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Solicitações de alteração aguardando sua aprovação
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: showHistory ? 'var(--primary-light)' : 'var(--bg)',
            color: showHistory ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>history</span>
          Histórico
        </button>
      </div>

      {/* Pending Approvals */}
      {pendingCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: showHistory ? 20 : 0 }}>
          {approvals.map(approval => {
            const uColor = unitColors[approval.order?.unit || ''] || '#64748b';
            const isProcessing = processing === approval.id;

            return (
              <div key={approval.id} style={{
                background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', borderLeft: '3px solid #f59e0b',
              }}>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    {/* Left: Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>
                          {approval.changeType === 'status_change' ? 'swap_horiz' : 'edit'}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                          {approval.order?.productName || 'Pedido'}
                        </span>
                        {approval.order?.unit && (
                          <span style={{ padding: '1px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800, background: `${uColor}12`, color: uColor }}>{approval.order.unit}</span>
                        )}
                        {approval.order?.batchNumber && (
                          <span style={{ padding: '1px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Lote #{approval.order.batchNumber}</span>
                        )}
                      </div>

                      {/* Changes detail */}
                      <div style={{ marginBottom: 6 }}>{renderChanges(approval)}</div>

                      {/* Reason if provided */}
                      {approval.reason && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: '0.78rem', color: '#6366f1', background: 'rgba(99,102,241,0.06)', padding: '4px 8px', borderRadius: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>comment</span>
                          <span style={{ fontWeight: 600 }}>{approval.reason}</span>
                        </div>
                      )}

                      {/* Requester & time */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>person</span>
                        <span style={{ fontWeight: 700 }}>{approval.requesterName}</span>
                        <span>·</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
                        <span>{formatDate(approval.createdAt)}</span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                      {/* Reason input */}
                      <input
                        placeholder="Motivo (opcional)"
                        value={reasonInputs[approval.id] || ''}
                        onChange={e => setReasonInputs(prev => ({ ...prev, [approval.id]: e.target.value }))}
                        style={{
                          width: 180, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                          fontSize: '0.78rem', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-main)',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleAction(approval.id, 'recusar')} disabled={isProcessing}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderRadius: 10,
                            background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
                            fontWeight: 800, fontSize: '0.82rem', cursor: isProcessing ? 'wait' : 'pointer',
                            fontFamily: 'inherit', opacity: isProcessing ? 0.5 : 1, transition: 'all 0.2s',
                          }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>Recusar
                        </button>
                        <button onClick={() => handleAction(approval.id, 'aprovar')} disabled={isProcessing}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 20px', borderRadius: 10,
                            background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#fff', border: 'none',
                            fontWeight: 800, fontSize: '0.82rem', cursor: isProcessing ? 'wait' : 'pointer',
                            fontFamily: 'inherit', opacity: isProcessing ? 0.5 : 1, boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                            transition: 'all 0.2s',
                          }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>Aprovar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {pendingCount === 0 && !showHistory && (
        <div style={{
          textAlign: 'center', padding: '24px 20px', background: 'var(--card-bg)',
          borderRadius: 14, border: '1px solid var(--border)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#22c55e', marginBottom: 8 }}>verified</span>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.88rem' }}>Nenhuma aprovação pendente</p>
        </div>
      )}

      {/* History section */}
      {showHistory && (
        <div>
          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Histórico de Decisões</h4>
          {history.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nenhum histórico encontrado.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.slice(0, 30).map(item => {
                const badge = getStatusBadge(item.status);
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)',
                    borderLeft: `3px solid ${badge.color}`,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: badge.color }}>{badge.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{item.order?.productName || 'Pedido'}</span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Solicitado por {item.requesterName}
                        {item.status !== 'direto' && <> · {badge.label} por {item.reviewedByName || '—'}</>}
                        {item.status === 'direto' && <> · Aplicado diretamente</>}
                        {' · '}{item.reviewedAt ? formatDate(item.reviewedAt) : formatDate(item.createdAt)}
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                      background: badge.bg, color: badge.color, whiteSpace: 'nowrap',
                    }}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }`}</style>
    </section>
  );
}
