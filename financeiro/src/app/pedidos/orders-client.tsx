'use client';
import { OrdersTable } from '@/components/orders-table';
import { OrderFilters } from '@/components/order-filters';
import { OrderModal } from '@/components/order-modal';
import { PriceComparisonPanel } from '@/components/price-comparison';
import { MercadoLivreSection } from '@/components/mercadolivre-section';
import { useOrders } from '@/hooks/useOrders';

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const unitColors: Record<string,string> = { all:'#3b82f6', Barueri:'#8b5cf6', Osasco:'#f59e0b', SBC:'#10b981', SCS:'#ef4444' };

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function OrdersClient() {
  const o = useOrders();

  return (
    <div>
      {/* Hero */}
      <section style={{ background: 'transparent', margin: '40px 0 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px', marginBottom: 8 }}>Controle de <span style={{ color: 'var(--primary)' }}>Compras</span></h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: 25, padding: '0 10px' }}>Gerencie pedidos, acompanhe preços e histórico por unidade.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={o.openCreateModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 'var(--radius-md)', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(230, 0, 126, 0.25)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span> Novo Pedido
          </button>
          {o.orders.length > 0 && (
            <button onClick={() => o.setShowPrices(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FFF159', color: '#333', border: 'none', padding: '12px 24px', borderRadius: 'var(--radius-md)', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span> Cotar Preços
            </button>
          )}
        </div>
      </section>

      {/* ─── Unit Selector ─── */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '14px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#3b82f6' }}>location_on</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>Unidade:</span>
        </div>
        {['all', ...UNITS].map(u => {
          const isActive = o.selectedUnit === u;
          const color = unitColors[u] || '#6366f1';
          return (
            <button key={u} onClick={() => o.setSelectedUnit(u)}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 14,
                border: `2px solid ${isActive ? color : 'var(--border)'}`,
                background: isActive ? `linear-gradient(135deg, ${color}12, ${color}06)` : 'var(--bg)',
                color: isActive ? color : 'var(--text-muted)',
                fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.25s', overflow: 'hidden',
                boxShadow: isActive ? `0 4px 16px ${color}20` : 'none',
                transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = `${color}66`; e.currentTarget.style.color = color; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.transform = 'translateY(0)'; }}}
            >
              {isActive && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />}
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {u === 'all' ? 'public' : 'apartment'}
              </span>
              {u === 'all' ? 'Todas' : u}
            </button>
          );
        })}
      </div>

      {/* ─── KPI Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Pedidos', value: o.totalOrders.toString(), icon: 'inventory_2', color: '#6366f1' },
          { label: 'Total Gasto', value: fmtBRL(o.totalSpent), icon: 'payments', color: '#10b981' },
          { label: 'Custo Médio', value: fmtBRL(o.avgPrice), icon: 'analytics', color: '#f59e0b' },
          { label: 'Aguardando', value: o.aguardando.toString(), icon: 'hourglass_top', color: '#ef4444' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: 16, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${kpi.color},${kpi.color}66)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: kpi.color, lineHeight: 1.1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ─── Date Filters ─── */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>calendar_today</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Período:</span>
        </div>
        <input type="date" value={o.dateFrom} onChange={e => o.setDateFrom(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, outline: 'none', color: 'var(--text-main)' }} />
        <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem' }}>até</span>
        <input type="date" value={o.dateTo} onChange={e => o.setDateTo(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, outline: 'none', color: 'var(--text-main)' }} />
        {(o.dateFrom || o.dateTo) && (
          <button onClick={() => { o.setDateFrom(''); o.setDateTo(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>Limpar
          </button>
        )}
      </div>

      <OrderFilters searchQuery={o.searchQuery} onSearchChange={o.setSearchQuery}
        statusFilter={o.statusFilter} onStatusChange={o.setStatusFilter}
        urgencyFilter={o.urgencyFilter} onUrgencyChange={o.setUrgencyFilter} />

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
