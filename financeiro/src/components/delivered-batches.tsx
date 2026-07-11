'use client';
import { useState, useMemo } from 'react';
import { formatCurrency as fmtBRL } from '@/lib/currency';

interface Order {
  id: string;
  productName: string;
  quantity: number;
  urgency: string;
  status: string;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  sourceUrl?: string;
  batchNumber?: number;
  createdAt?: string;
}

interface Props {
  orders: Order[];
}

export function DeliveredBatches({ orders }: Props) {
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);

  const delivered = useMemo(() =>
    orders.filter(o => o.status === 'Entregue'),
    [orders]
  );

  // Group by batchNumber
  const batches = useMemo(() => {
    const map = new Map<number, Order[]>();
    delivered.forEach(o => {
      const bn = o.batchNumber || 0;
      if (!map.has(bn)) map.set(bn, []);
      map.get(bn)!.push(o);
    });
    // Sort by batch number descending (newest first)
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [delivered]);

  // Analytics data
  const analytics = useMemo(() => {
    const productMap = new Map<string, { qty: number; total: number; count: number }>();
    delivered.forEach(o => {
      const key = o.productName;
      const existing = productMap.get(key) || { qty: 0, total: 0, count: 0 };
      existing.qty += o.quantity;
      existing.total += o.totalPrice || 0;
      existing.count += 1;
      productMap.set(key, existing);
    });

    const topProducts = Array.from(productMap.entries())
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 8);

    const totalSpent = delivered.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const totalItems = delivered.reduce((s, o) => s + o.quantity, 0);
    const avgBatchCost = batches.length > 0
      ? totalSpent / batches.length
      : 0;

    // Spending by unit
    const unitMap = new Map<string, number>();
    delivered.forEach(o => {
      const u = o.unit || 'Sem unidade';
      unitMap.set(u, (unitMap.get(u) || 0) + (o.totalPrice || 0));
    });
    const unitSpend = Array.from(unitMap.entries()).sort((a, b) => b[1] - a[1]);

    // Monthly spending
    const monthMap = new Map<string, number>();
    delivered.forEach(o => {
      if (!o.createdAt) return;
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) || 0) + (o.totalPrice || 0));
    });
    const monthlySpend = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);

    return { topProducts, totalSpent, totalItems, avgBatchCost, unitSpend, monthlySpend, uniqueProducts: productMap.size };
  }, [delivered, batches]);

  if (delivered.length === 0) return null;

  const maxQty = analytics.topProducts[0]?.[1].qty || 1;
  const maxMonthly = Math.max(...analytics.monthlySpend.map(m => m[1]), 1);

  const unitColors: Record<string, string> = {  Osasco: '#f59e0b', SBC: '#10b981', SCS: '#ef4444' };

  return (
    <div style={{ marginTop: 32 }}>
      {/* ─── Section Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#10b98112', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#10b981' }}>inventory_2</span>
        </div>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Histórico de <span style={{ color: '#10b981' }}>Compras</span></h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{batches.length} pedidos entregues • {analytics.totalItems} itens • {fmtBRL(analytics.totalSpent)} investido</p>
        </div>
      </div>

      {/* ─── Analytics Dashboard ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Investido', value: fmtBRL(analytics.totalSpent), icon: 'account_balance', color: '#10b981' },
          { label: 'Custo Médio/Lote', value: fmtBRL(analytics.avgBatchCost), icon: 'avg_pace', color: '#3b82f6' },
          { label: 'Lotes Concluídos', value: batches.length.toString(), icon: 'package_2', color: '#8b5cf6' },
          { label: 'Produtos Únicos', value: analytics.uniqueProducts.toString(), icon: 'category', color: '#f59e0b' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 14, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${kpi.color},${kpi.color}44)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ─── Charts Row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Top Products */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>trending_up</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>Mais Consumidos</span>
          </div>
          {analytics.topProducts.map(([name, data], i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{data.qty} un • {fmtBRL(data.total)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, width: `${(data.qty / maxQty) * 100}%`,
                  background: `linear-gradient(90deg, #6366f1, #818cf8)`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          ))}
          {analytics.topProducts.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: 20 }}>Sem dados</p>
          )}
        </div>

        {/* Spending by Unit + Monthly */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* By Unit */}
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>pie_chart</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>Gasto por Unidade</span>
            </div>
            {analytics.unitSpend.map(([unit, total], i) => {
              const pct = analytics.totalSpent > 0 ? (total / analytics.totalSpent) * 100 : 0;
              const color = unitColors[unit] || '#6366f1';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, flex: 1 }}>{unit}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color }}>{fmtBRL(total)}</span>
                </div>
              );
            })}
          </div>

          {/* Monthly Trend */}
          {analytics.monthlySpend.length > 1 && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>show_chart</span>
                <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>Evolução Mensal</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                {analytics.monthlySpend.map(([month, total], i) => {
                  const h = (total / maxMonthly) * 100;
                  const [y, m] = month.split('-');
                  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)' }}>{fmtBRL(total)}</span>
                      <div style={{ width: '100%', height: `${h}%`, minHeight: 4, borderRadius: 4, background: 'linear-gradient(180deg, #10b981, #10b98144)', transition: 'height 0.5s' }} />
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)' }}>{monthNames[parseInt(m) - 1]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Batch List ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {batches.map(([batchNum, items]) => {
          const batchTotal = items.reduce((s, o) => s + (o.totalPrice || 0), 0);
          const batchDate = items[0]?.createdAt ? new Date(items[0].createdAt).toLocaleDateString('pt-BR') : '';
          const isExpanded = expandedBatch === batchNum;

          return (
            <div key={batchNum} style={{
              background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)',
              overflow: 'hidden', transition: 'all 0.2s',
            }}>
              {/* Batch Header */}
              <button onClick={() => setExpandedBatch(isExpanded ? null : batchNum)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'linear-gradient(135deg, #10b98122, #10b98108)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.82rem', fontWeight: 900, color: '#10b981',
                  }}>
                    #{batchNum || '?'}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      Pedido #{batchNum || '?'} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 6 }}>{batchDate}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {items.length} {items.length === 1 ? 'item' : 'itens'} • {items.reduce((s, o) => s + o.quantity, 0)} unidades
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1rem', fontWeight: 900, color: '#10b981' }}>{fmtBRL(batchTotal)}</span>
                  <span className="material-symbols-outlined" style={{
                    fontSize: 20, color: 'var(--text-muted)', transition: 'transform 0.2s',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                  }}>expand_more</span>
                </div>
              </button>

              {/* Batch Items */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
                  {items.map((item, idx) => (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
                      borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', width: 24 }}>{idx + 1}.</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{item.productName}</span>
                          {item.sourceUrl && (
                            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', color: '#3b82f6', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none', gap: 2 }}
                              onClick={e => e.stopPropagation()}>
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>link
                            </a>
                          )}
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {item.quantity}x • {item.unit || '-'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {item.unitPrice && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{fmtBRL(item.unitPrice)}/un</div>}
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>{item.totalPrice ? fmtBRL(item.totalPrice) : '-'}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, marginTop: 4, borderTop: '2px solid var(--border)' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#10b981' }}>Total: {fmtBRL(batchTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
