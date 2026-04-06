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
}

interface Approval {
  id: string;
  orderId: string;
  requesterId: string | null;
  requesterName: string;
  changeType: string;
  changeData: Record<string, any>;
  description: string;
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

export function OrderApprovalPanel() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Approval[]>([]);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/approvals?status=pendente');
      if (res.ok) {
        const data = await res.json();
        setApprovals(data);
      }
    } catch (err) {
      console.error('Fetch approvals error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const [approvedRes, rejectedRes] = await Promise.all([
        fetch('/api/orders/approvals?status=aprovado'),
        fetch('/api/orders/approvals?status=recusado'),
      ]);
      const approved = approvedRes.ok ? await approvedRes.json() : [];
      const rejected = rejectedRes.ok ? await rejectedRes.json() : [];
      const all = [...approved, ...rejected].sort((a: Approval, b: Approval) =>
        new Date(b.reviewedAt || b.createdAt).getTime() - new Date(a.reviewedAt || a.createdAt).getTime()
      );
      setHistory(all);
    } catch {}
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const handleAction = async (approvalId: string, action: 'aprovar' | 'recusar') => {
    setProcessing(approvalId);
    const { userName, userId } = getUserInfo();
    try {
      const res = await fetch('/api/orders/approvals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, action, userId, userName }),
      });
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== approvalId));
        // Dispatch event to refresh orders list
        window.dispatchEvent(new CustomEvent('virtuosa-orders-refresh'));
      }
    } catch (err) {
      console.error('Action error:', err);
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = approvals.length;

  if (loading) return null;

  const unitColors: Record<string, string> = { Barueri: '#8b5cf6', Osasco: '#f59e0b', SBC: '#10b981', SCS: '#ef4444' };

  const getChangeIcon = (changeType: string) => {
    if (changeType === 'status_change') return 'swap_horiz';
    return 'edit';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const renderChanges = (approval: Approval) => {
    const { changeData, order } = approval;
    const items: { label: string; from: string; to: string }[] = [];

    if (changeData.status && order) {
      items.push({ label: 'Status', from: order.status, to: changeData.status });
    }
    if (changeData.productName && order) {
      items.push({ label: 'Nome', from: order.productName, to: changeData.productName });
    }
    if (changeData.quantity !== undefined && order) {
      items.push({ label: 'Quantidade', from: String(order.quantity), to: String(changeData.quantity) });
    }
    if (changeData.urgency && order) {
      items.push({ label: 'Urgência', from: order.urgency, to: changeData.urgency });
    }

    if (items.length === 0) return <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{approval.description}</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 70 }}>{item.label}:</span>
            <span style={{ padding: '1px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: '0.78rem', textDecoration: 'line-through' }}>{item.from}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>arrow_forward</span>
            <span style={{ padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: '0.78rem' }}>{item.to}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <section style={{ marginBottom: 20 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
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
                  fontSize: '0.72rem', fontWeight: 900,
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
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: showHistory ? 'var(--primary-light)' : 'var(--bg)',
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
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
                borderLeft: '3px solid #f59e0b',
              }}>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    {/* Left: Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>{getChangeIcon(approval.changeType)}</span>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                          {approval.order?.productName || 'Pedido'}
                        </span>
                        {approval.order?.unit && (
                          <span style={{
                            padding: '1px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                            background: `${uColor}12`, color: uColor,
                          }}>{approval.order.unit}</span>
                        )}
                        {approval.order?.batchNumber && (
                          <span style={{
                            padding: '1px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700,
                            background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                          }}>Lote #{approval.order.batchNumber}</span>
                        )}
                      </div>

                      {/* Changes detail */}
                      <div style={{ marginBottom: 6 }}>
                        {renderChanges(approval)}
                      </div>

                      {/* Requester & time */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>person</span>
                        <span style={{ fontWeight: 700 }}>{approval.requesterName}</span>
                        <span>·</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
                        <span>{formatDate(approval.createdAt)}</span>
                      </div>
                    </div>

                    {/* Right: Action buttons */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <button
                        onClick={() => handleAction(approval.id, 'recusar')}
                        disabled={isProcessing}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '8px 16px', borderRadius: 10,
                          background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
                          fontWeight: 800, fontSize: '0.82rem', cursor: isProcessing ? 'wait' : 'pointer',
                          fontFamily: 'inherit', opacity: isProcessing ? 0.5 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                        Recusar
                      </button>
                      <button
                        onClick={() => handleAction(approval.id, 'aprovar')}
                        disabled={isProcessing}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '8px 20px', borderRadius: 10,
                          background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#fff',
                          border: 'none',
                          fontWeight: 800, fontSize: '0.82rem', cursor: isProcessing ? 'wait' : 'pointer',
                          fontFamily: 'inherit', opacity: isProcessing ? 0.5 : 1,
                          boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                        Aprovar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state for pending */}
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
          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
            Histórico de Aprovações
          </h4>
          {history.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nenhum histórico encontrado.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.slice(0, 20).map(item => {
                const isApproved = item.status === 'aprovado';
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)',
                    borderLeft: `3px solid ${isApproved ? '#22c55e' : '#ef4444'}`,
                  }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 18, color: isApproved ? '#22c55e' : '#ef4444',
                    }}>{isApproved ? 'check_circle' : 'cancel'}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{item.description}</span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Solicitado por {item.requesterName} · {isApproved ? 'Aprovado' : 'Recusado'} por {item.reviewedByName || '—'} · {item.reviewedAt ? formatDate(item.reviewedAt) : '—'}
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                      background: isApproved ? '#dcfce7' : '#fee2e2',
                      color: isApproved ? '#16a34a' : '#dc2626',
                    }}>{isApproved ? 'Aprovado' : 'Recusado'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
