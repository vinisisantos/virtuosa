'use client';
import { useCallback, useEffect, useState } from 'react';
import { OrdersTable } from '@/components/orders-table';
import { OrderFilters } from '@/components/order-filters';
import { OrderModal, type OrderData } from '@/components/order-modal';
import { OrderCostRecognitionModal } from '@/components/order-cost-recognition-modal';
import { PriceComparisonPanel } from '@/components/price-comparison';
import { MercadoLivreSection } from '@/components/mercadolivre-section';
import { DeliveredBatches } from '@/components/delivered-batches';
import { OrderApprovalPanel } from '@/components/order-approval-panel';
import { OrderAuditPanel } from '@/components/order-audit-panel';
import { useOrders } from '@/hooks/useOrders';
import { useOrdersViewPreference } from '@/hooks/useOrdersViewPreference';
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
        canManageCosts: isAdmin || (
          perms.pedidos === true
          && (perms.financeiro === true || perms.finCustos === true)
        ),
      };
    }
  } catch {}
  return { canApprove: false, canViewHistory: false, canDeleteHistory: false, canManageCosts: false };
}

export function OrdersClient() {
  const o = useOrders();
  const orderView = useOrdersViewPreference();
  const [showApprovals, setShowApprovals] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<{ unit: string; count: number } | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [canDeleteHistory, setCanDeleteHistory] = useState(false);
  const [canManageCosts] = useState(() => getUserPermissions().canManageCosts);
  const [costRecognitionOrder, setCostRecognitionOrder] = useState<OrderData | null>(null);

  useEffect(() => {
    const perms = getUserPermissions();
    setShowApprovals(perms.canApprove);
    setShowAudit(perms.canViewHistory);
    setCanDeleteHistory(perms.canDeleteHistory);
  }, []);

  const updatePendingApprovals = useCallback((count: number) => {
    setPendingApprovals({ unit: o.selectedUnit, count });
  }, [o.selectedUnit]);

  // Listen for refresh events from approval panel
  useEffect(() => {
    const handler = () => o.refreshOrders?.();
    window.addEventListener('virtuosa-orders-refresh', handler);
    return () => window.removeEventListener('virtuosa-orders-refresh', handler);
  }, [o]);

  return (
    <div className="orders-page">
      {/* Hero — mobile-first */}
      <section className="orders-page-hero" style={{ background: 'transparent', margin: '16px 0 14px' }}>
        <div className="orders-page-hero-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.3px', margin: 0 }}>
              Controle de <span style={{ color: 'var(--primary)' }}>Compras</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '3px 0 0' }}>Priorize aprovações e acompanhe cada item sem rolagem lateral.</p>
          </div>
          <div className="orders-page-actions">
            <button className="orders-page-action" onClick={o.openCreateModal} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary)', color: 'white', border: 'none', padding: '0 14px', minHeight: 44, borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span> Novo Pedido
            </button>
            {o.orders.length > 0 && (
              <button className="orders-page-action" onClick={() => o.setShowPrices(true)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#FFF159', color: '#333', border: 'none', padding: '0 12px', minHeight: 44, borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>search</span> Cotar Preços
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Indicadores da seleção atual, sem consultas adicionais. */}
      <div className="orders-kpi-grid">
        {[
          { label: 'Aguardando', value: o.aguardando.toString(), context: 'Itens ainda não pedidos', icon: 'hourglass_top', color: '#f59e0b' },
          { label: 'Urgentes', value: o.orders.filter(order => order.urgency === 'Urgente').length.toString(), context: 'Prioridade de compra', icon: 'priority_high', color: '#ef4444' },
          ...(showApprovals ? [{ label: 'Aprovações', value: pendingApprovals?.unit === o.selectedUnit ? pendingApprovals.count.toString() : '—', context: 'Solicitações pendentes', icon: 'approval', color: '#8b5cf6' }] : []),
          { label: 'Total informado', value: fmtBRL(o.totalSpent), context: 'Valores dos itens filtrados', icon: 'payments', color: '#10b981' },
        ].map(kpi => (
          <div key={kpi.label} className="orders-kpi" style={{ borderTopColor: kpi.color }}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.context}</small>
          </div>
        ))}
      </div>
      <div className="orders-secondary-metrics">
        <span>Total de pedidos: <strong>{o.totalOrders}</strong></span>
        <span>Custo médio: <strong>{fmtBRL(o.avgPrice)}</strong></span>
      </div>

      <OrderFilters searchQuery={o.searchQuery} onSearchChange={o.setSearchQuery}
        statusFilter={o.statusFilter} onStatusChange={o.setStatusFilter}
        urgencyFilter={o.urgencyFilter} onUrgencyChange={o.setUrgencyFilter}
        dateFrom={o.dateFrom} onDateFromChange={o.setDateFrom}
        dateTo={o.dateTo} onDateToChange={o.setDateTo} />

      {/* ─── Approval Panel — for users with pedidosAprovar ─── */}
      {showApprovals && <OrderApprovalPanel unit={o.selectedUnit} onPendingCountChange={updatePendingApprovals} />}

      <div className="orders-list-heading">
        <div>
          <h2>Pedidos em andamento</h2>
          <span>{o.totalOrders} {o.totalOrders === 1 ? 'item visível' : 'itens visíveis'}</span>
        </div>
        <div className="orders-view-switch" role="group" aria-label="Visualização dos pedidos">
          <button type="button" aria-pressed={orderView.viewMode === 'detailed'} disabled={orderView.loading || orderView.saving} onClick={() => orderView.changeView('detailed')}>
            <span className="material-symbols-outlined" aria-hidden="true">view_agenda</span> Lotes detalhados
          </button>
          <button type="button" aria-pressed={orderView.viewMode === 'compact'} disabled={orderView.loading || orderView.saving} onClick={() => orderView.changeView('compact')}>
            <span className="material-symbols-outlined" aria-hidden="true">view_list</span> Fila compacta
          </button>
        </div>
      </div>

      {/* ─── Orders Table ─── */}
      {(o.loading && o.orders.length === 0) || orderView.loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>progress_activity</span>
          <p style={{ marginTop: 12, fontWeight: 700 }}>Carregando pedidos...</p>
        </div>
      ) : (
        <OrdersTable
          orders={o.orders}
          viewMode={orderView.viewMode}
          onEdit={o.openEditModal}
          onDelete={o.handleDeleteOrder}
          onStatusChange={o.handleStatusChange}
          onCostRecognition={canManageCosts ? setCostRecognitionOrder : undefined}
        />
      )}

      {o.isModalOpen && <OrderModal order={o.editingOrder} onSave={o.handleSaveOrder} onClose={() => o.setIsModalOpen(false)} defaultUnit={o.selectedUnit !== 'all' ? o.selectedUnit : undefined} />}

      {canManageCosts && costRecognitionOrder && (
        <OrderCostRecognitionModal
          order={costRecognitionOrder}
          saving={o.costRecognitionSaving}
          onClose={() => setCostRecognitionOrder(null)}
          onChange={async (costRecognizedAt) => {
            if (!costRecognitionOrder.id) return;
            await o.handleCostRecognition(costRecognitionOrder.id, costRecognizedAt);
            setCostRecognitionOrder(null);
          }}
        />
      )}

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
      {showAudit && <OrderAuditPanel canDelete={canDeleteHistory} unit={o.selectedUnit} />}

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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .orders-page { min-width: 0; max-width: 100%; overflow-x: hidden; }
        .orders-page-hero-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; min-width: 0; }
        .orders-page-actions { display: grid; grid-auto-flow: column; gap: 8px; flex-shrink: 0; }
        .orders-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 10px; margin-bottom: 9px; }
        .orders-kpi { display: flex; flex-direction: column; min-width: 0; min-height: 102px; padding: 13px 14px; background: var(--card-bg); border: 1px solid var(--border); border-top: 3px solid; border-radius: 12px; }
        .orders-kpi > span { color: var(--text-muted); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; }
        .orders-kpi > strong { color: var(--text-main); font-size: 1.32rem; line-height: 1.25; overflow-wrap: anywhere; margin-top: 4px; }
        .orders-kpi > small { color: var(--text-muted); font-size: 0.72rem; }
        .orders-secondary-metrics { display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--text-muted); font-size: 0.76rem; margin-bottom: 15px; }
        .orders-secondary-metrics strong { color: var(--text-main); }
        .orders-list-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .orders-list-heading > div:first-child { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .orders-list-heading h2 { margin: 0; color: var(--text-main); font-size: 1.05rem; font-weight: 800; }
        .orders-list-heading > div:first-child > span { color: var(--text-muted); font-size: 0.75rem; }
        .orders-view-switch { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 11px; background: var(--card-bg); }
        .orders-view-switch button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 40px; padding: 6px 11px; border: 0; border-radius: 8px; color: var(--text-muted); background: transparent; font-family: inherit; font-size: 0.76rem; font-weight: 700; line-height: 1.2; cursor: pointer; }
        .orders-view-switch button[aria-pressed="true"] { background: var(--primary-light); color: var(--primary); }
        .orders-view-switch button:disabled { cursor: wait; }
        .orders-view-switch .material-symbols-outlined { font-size: 17px; }

        @media (max-width: 1023px) {
          .orders-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 640px) {
          .orders-page-hero-row { align-items: stretch; }
          .orders-page-actions { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
          .orders-page-action { width: 100%; min-width: 0; }
          .orders-view-switch { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .orders-view-switch button { min-width: 0; }
        }

        @media (max-width: 380px) {
          .orders-page-actions { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>

      {o.showPrices && (
        <PriceComparisonPanel products={o.orders.map(x => ({ productName: x.productName, quantity: x.quantity }))} onClose={() => o.setShowPrices(false)} />
      )}
    </div>
  );
}
