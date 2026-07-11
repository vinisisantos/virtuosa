'use client';
import { useEffect, useState } from 'react';
import { OrdersTable } from '@/components/orders-table';
import { OrderFilters } from '@/components/order-filters';
import { OrderModal } from '@/components/order-modal';
import { PriceComparisonPanel } from '@/components/price-comparison';
import { MercadoLivreSection } from '@/components/mercadolivre-section';
import { DeliveredBatches } from '@/components/delivered-batches';
import { OrderApprovalPanel } from '@/components/order-approval-panel';
import { OrderAuditPanel } from '@/components/order-audit-panel';
import { useOrders } from '@/hooks/useOrders';
import { DatePicker } from '@/components/ui/date-picker';
import { formatCurrency as fmtBRL } from '@/lib/currency';

function getUserPermissions() {
  try {
    const stored = localStorage.getItem('virtuosa_user');
    if (stored) {
      const user = JSON.parse(stored);
      const perms = user.permissions || {};
      const isAdmin = perms.admin === true || user.role === 'ADMINISTRADOR';
      return {
        canApprove: isAdmin || perms.pedidosAprovar === true,
        canViewHistory: isAdmin || perms.pedidosHistorico === true,
        canDeleteHistory: isAdmin || perms.pedidosExcluirHistorico === true,
      };
    }
  } catch {}
  return { canApprove: false, canViewHistory: false, canDeleteHistory: false };
}

export function OrdersClient() {
  const o = useOrders();
  const [showApprovals, setShowApprovals] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [canDeleteHistory, setCanDeleteHistory] = useState(false);

  useEffect(() => {
    const perms = getUserPermissions();
    setShowApprovals(perms.canApprove);
    setShowAudit(perms.canViewHistory);
    setCanDeleteHistory(perms.canDeleteHistory);
  }, []);

  // Listen for refresh events from approval panel
  useEffect(() => {
    const handler = () => o.refreshOrders?.();
    window.addEventListener('virtuosa-orders-refresh', handler);
    return () => window.removeEventListener('virtuosa-orders-refresh', handler);
  }, [o]);

  return (
    <div>
      {/* Hero — mobile-first */}
      <section style={{ background: 'transparent', margin: '16px 0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.3px', margin: 0 }}>
              Controle de <span style={{ color: 'var(--primary)' }}>Compras</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '3px 0 0' }}>Gerencie pedidos, preços e histórico por unidade.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={o.openCreateModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary)', color: 'white', border: 'none', padding: '0 14px', height: 40, borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span> Novo Pedido
            </button>
            {o.orders.length > 0 && (
              <button onClick={() => o.setShowPrices(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFF159', color: '#333', border: 'none', padding: '0 12px', height: 40, borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>search</span> Cotar Preços
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─── KPI Cards — auto-fit, 2 cols em mobile ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Pedidos', value: o.totalOrders.toString(), icon: 'inventory_2', color: '#6366f1' },
          { label: 'Total Gasto', value: fmtBRL(o.totalSpent), icon: 'payments', color: '#10b981' },
          { label: 'Custo Médio', value: fmtBRL(o.avgPrice), icon: 'analytics', color: '#f59e0b' },
          { label: 'Aguardando', value: o.aguardando.toString(), icon: 'hourglass_top', color: '#ef4444' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)', padding: '12px 12px 10px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${kpi.color},${kpi.color}66)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', lineHeight: 1.3 }}>{kpi.label}</span>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: kpi.color, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ─── Date Filters — inline compacto ─── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-muted)' }}>calendar_today</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Período:</span>
        </div>
        <DatePicker value={o.dateFrom} onChange={o.setDateFrom} label="Início" />
        <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>até</span>
        <DatePicker value={o.dateTo} onChange={o.setDateTo} label="Fim" />
        {(o.dateFrom || o.dateTo) && (
          <button onClick={() => { o.setDateFrom(''); o.setDateTo(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.73rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>Limpar
          </button>
        )}
      </div>

      <OrderFilters searchQuery={o.searchQuery} onSearchChange={o.setSearchQuery}
        statusFilter={o.statusFilter} onStatusChange={o.setStatusFilter}
        urgencyFilter={o.urgencyFilter} onUrgencyChange={o.setUrgencyFilter} />

      {/* ─── Approval Panel — for users with pedidosAprovar ─── */}
      {showApprovals && <OrderApprovalPanel />}

      {/* ─── Orders Table ─── */}
      {o.loading && o.orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>progress_activity</span>
          <p style={{ marginTop: 12, fontWeight: 700 }}>Carregando pedidos...</p>
        </div>
      ) : (
        <OrdersTable orders={o.orders} onEdit={o.openEditModal} onDelete={o.handleDeleteOrder} onStatusChange={o.handleStatusChange} />
      )}

      {o.isModalOpen && <OrderModal order={o.editingOrder} onSave={o.handleSaveOrder} onClose={() => o.setIsModalOpen(false)} defaultUnit={o.selectedUnit !== 'all' ? o.selectedUnit : undefined} />}

      {o.orderToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card-bg)', width: '100%', maxWidth: 400, borderRadius: 'var(--radius-lg)', padding: 32, boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: '#fee2e2', color: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>delete_forever</span>
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 12 }}>Excluir Pedido</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: 24 }}>Tem certeza? Esta ação não pode ser desfeita.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => o.setOrderToDelete(null)} style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-md)', background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={o.confirmDeleteOrder} style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-md)', background: '#ef4444', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Sim, excluir</button>
            </div>
          </div>
        </div>
      )}

      <MercadoLivreSection unit={o.selectedUnit} />

      {/* ─── Audit History Panel — for users with pedidosHistorico ─── */}
      {showAudit && <OrderAuditPanel canDelete={canDeleteHistory} />}

      {/* ─── Delivered Batches History + Analytics ─── */}
      <DeliveredBatches orders={o.orders as any} />

      {/* Approval Message Modal */}
      {o.approvalMessage && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card-bg)', width: '100%', maxWidth: 420, borderRadius: 'var(--radius-lg)', padding: 32, boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: '#fef3c7', color: '#f59e0b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>approval</span>
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 12 }}>Aprovação Necessária</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.6 }}>{o.approvalMessage}</p>
            <button onClick={() => o.setApprovalMessage(null)} style={{ padding: '12px 32px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.92rem' }}>Ok, entendi</button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {o.showPrices && (
        <PriceComparisonPanel products={o.orders.map(x => ({ productName: x.productName, quantity: x.quantity }))} onClose={() => o.setShowPrices(false)} />
      )}
    </div>
  );
}
