'use client';
import { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/currency';

interface MLOrder {
  id: string;
  mlOrderId: string;
  unit: string;
  productTitle: string;
  productImageUrl: string | null;
  quantity: number;
  totalAmount: number;
  orderStatus: string;
  shippingStatus: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  sellerNickname: string | null;
  buyDate: string;
  lastUpdated: string;
}

interface MLConnection {
  connected: boolean;
  mlUsername: string | null;
  unit: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  paid: { label: 'Pago', color: '#3b82f6', icon: 'payments' },
  confirmed: { label: 'Confirmado', color: '#8b5cf6', icon: 'check_circle' },
  shipped: { label: 'Enviado', color: '#f59e0b', icon: 'local_shipping' },
  delivered: { label: 'Entregue', color: '#10b981', icon: 'inventory' },
  cancelled: { label: 'Cancelado', color: '#ef4444', icon: 'cancel' },
};

const SHIPPING_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: '#6b7280' },
  ready_to_ship: { label: 'Pronto para envio', color: '#f59e0b' },
  shipped: { label: 'Em trânsito', color: '#3b82f6' },
  delivered: { label: 'Entregue', color: '#10b981' },
  not_delivered: { label: 'Não entregue', color: '#ef4444' },
};

function getStatus(s: string) { return STATUS_MAP[s] || { label: s, color: '#6b7280', icon: 'help' }; }
function getShipping(s: string | null) { return s ? (SHIPPING_MAP[s] || { label: s, color: '#6b7280' }) : null; }

const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', backdropFilter: 'blur(20px)', borderRadius: 20,
  border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
};

export function MercadoLivreSection({ unit }: { unit: string }) {
  const [connection, setConnection] = useState<MLConnection | null>(null);
  const [orders, setOrders] = useState<MLOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('virtuosa_ml_collapsed') === 'true';
    return false;
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => { const n = !prev; localStorage.setItem('virtuosa_ml_collapsed', String(n)); return n; });
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/mercadolivre/status?unit=${unit}`);
      const data = await res.json();
      setConnection(data);
    } catch { setConnection(null); }
  }, [unit]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/mercadolivre/orders?unit=${unit}`);
      const data = await res.json();
      if (Array.isArray(data)) setOrders(data);
    } catch { /* ignore */ }
  }, [unit]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStatus(), fetchOrders()]).finally(() => setLoading(false));
  }, [fetchStatus, fetchOrders]);

  // Check URL for ML callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ml_success')) {
      fetchStatus(); fetchOrders();
      window.history.replaceState({}, '', '/pedidos');
    }
    if (params.get('ml_error')) {
      window.history.replaceState({}, '', '/pedidos');
    }
  }, [fetchStatus, fetchOrders]);

  const handleConnect = () => {
    window.location.href = `/api/mercadolivre/auth?unit=${unit}`;
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/mercadolivre/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit }),
      });
      await fetchOrders();
    } catch { /* ignore */ }
    setSyncing(false);
  };

  const handleDisconnect = async () => {
    if (!await confirmDialog({ title: 'Desconectar ML', message: `Desconectar Mercado Livre de ${unit}?`, confirmText: 'Sim, desconectar', variant: 'warning' })) return;
    await fetch(`/api/mercadolivre/status?unit=${unit}`, { method: 'DELETE' });
    setConnection(null);
    setOrders([]);
  };

  const isConnected = connection?.connected;

  return (
    <section style={{ marginTop: 30 }}>
      {/* Header */}
      <div onClick={toggleCollapsed} style={{ ...cardS, padding: '14px 24px', marginBottom: collapsed ? 0 : 16, cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF159', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#333' }}>shopping_bag</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>Mercado Livre</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {isConnected ? `Conectado como ${connection?.mlUsername || unit}` : 'Não conectado'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: isConnected ? '#10b981' : '#ef4444',
            display: 'inline-block', boxShadow: isConnected ? '0 0 8px rgba(16,185,129,0.4)' : 'none',
          }} />
          {orders.length > 0 && (
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '3px 10px', borderRadius: 12 }}>
              {orders.length} pedidos
            </span>
          )}
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)', transition: 'transform 0.3s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>expand_more</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: collapsed ? 0 : 10000, opacity: collapsed ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.4s ease, opacity 0.3s ease' }}>
        {!isConnected ? (
          <div style={{ ...cardS, padding: 40, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FFF159', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#333' }}>link</span>
            </div>
            <h3 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>Conecte sua conta</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 400, margin: '0 auto 20px' }}>
              Vincule a conta do Mercado Livre da unidade <strong>{unit}</strong> para acompanhar pedidos e entregas em tempo real.
            </p>
            <button onClick={handleConnect} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FFF159', color: '#333',
              border: 'none', padding: '14px 28px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 800,
              fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>login</span>
              Conectar Mercado Livre
            </button>
          </div>
        ) : (
          <>
            {/* Actions bar */}
            <div style={{ ...cardS, padding: '12px 20px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSync} disabled={syncing} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
                  border: '1px solid var(--border)', background: syncing ? 'var(--bg)' : 'var(--bg)',
                  fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82rem', cursor: syncing ? 'wait' : 'pointer', color: 'var(--text-main)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                    {syncing ? 'progress_activity' : 'sync'}
                  </span>
                  {syncing ? 'Sincronizando...' : 'Atualizar'}
                </button>
              </div>
              <button onClick={handleDisconnect} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)',
                fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', color: '#ef4444',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link_off</span> Desconectar
              </button>
            </div>

            {/* Orders list */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                <p style={{ marginTop: 8, fontWeight: 600 }}>Carregando pedidos...</p>
              </div>
            ) : orders.length === 0 ? (
              <div style={{ ...cardS, padding: 40, textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-muted)', opacity: 0.3 }}>inbox</span>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>Nenhum pedido encontrado. Clique em "Atualizar" para sincronizar.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orders.map(order => {
                  const status = getStatus(order.orderStatus);
                  const shipping = getShipping(order.shippingStatus);
                  return (
                    <div key={order.id} style={{ ...cardS, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Product Image */}
                      <div style={{ width: 50, height: 50, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--bg)' }}>
                        {order.productImageUrl ? (
                          <img src={order.productImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#d1d5db' }}>image</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.productTitle}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          {order.sellerNickname && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              por {order.sellerNickname}
                            </span>
                          )}
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {new Date(order.buyDate).toLocaleDateString('pt-BR')}
                          </span>
                          {order.quantity > 1 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Qtd: {order.quantity}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status badges */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 8,
                          fontSize: '0.75rem', fontWeight: 700, background: `${status.color}15`, color: status.color,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{status.icon}</span>
                          {status.label}
                        </span>
                        {shipping && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: shipping.color }}>
                            {shipping.label}
                          </span>
                        )}
                        {order.trackingNumber && (
                          <span style={{ fontSize: '0.68rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => order.trackingUrl && window.open(order.trackingUrl, '_blank')}
                          >
                            📦 {order.trackingNumber}
                          </span>
                        )}
                      </div>

                      {/* Price */}
                      <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#10b981', flexShrink: 0 }}>
                        {formatCurrency(order.totalAmount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
