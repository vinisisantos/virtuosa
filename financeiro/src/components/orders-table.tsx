'use client';

import { useState } from 'react';
import { OrderData } from './order-modal';

interface OrdersTableProps {
    orders: OrderData[];
    onEdit: (order: OrderData) => void;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, newStatus: string, estimatedArrival?: string) => void;
}

function fmtBRL(v?: number) {
    if (v === undefined || v === null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface BatchGroup {
    batchNumber: number | null;
    orders: OrderData[];
    totalPrice: number;
    createdAt: string;
    itemCount: number;
}

export function OrdersTable({ orders, onEdit, onDelete, onStatusChange }: OrdersTableProps) {
    const [etaModal, setEtaModal] = useState<{id: string, productName: string} | null>(null);
    const [etaDate, setEtaDate] = useState('');
    const [collapsedBatches, setCollapsedBatches] = useState<Set<number | null>>(new Set());

    if (!orders || orders.length === 0) {
        return (
            <div style={{
                textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)',
                borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)'
            }}>
                <div style={{ width: 64, height: 64, background: 'var(--bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32 }}>inventory_2</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Nenhum pedido encontrado</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Os pedidos registrados aparecerão aqui.</p>
            </div>
        );
    }

    // Group orders by batchNumber
    const batchMap = new Map<number | null, OrderData[]>();
    orders.forEach(o => {
        const key = o.batchNumber ?? null;
        if (!batchMap.has(key)) batchMap.set(key, []);
        batchMap.get(key)!.push(o);
    });

    const batches: BatchGroup[] = Array.from(batchMap.entries()).map(([batchNumber, batchOrders]) => ({
        batchNumber,
        orders: batchOrders,
        totalPrice: batchOrders.reduce((s, o) => s + (o.totalPrice || 0), 0),
        createdAt: batchOrders[0]?.createdAt || '',
        itemCount: batchOrders.length,
    }));

    // Sort batches by most recent first
    batches.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const toggleBatch = (batchNum: number | null) => {
        setCollapsedBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchNum)) next.delete(batchNum);
            else next.add(batchNum);
            return next;
        });
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'Aguardando': return { bg: '#fef3c7', text: '#d97706', dot: '#f59e0b', icon: 'pending_actions' };
            case 'Pedido': return { bg: '#dbeafe', text: '#2563eb', dot: '#3b82f6', icon: 'local_shipping' };
            case 'Entregue': return { bg: '#dcfce7', text: '#16a34a', dot: '#22c55e', icon: 'check_circle' };
            case 'Cancelado': return { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444', icon: 'cancel' };
            default: return { bg: '#f1f5f9', text: '#475569', dot: '#64748b', icon: 'help' };
        }
    };

    const getUrgencyConfig = (urgency: string) => {
        switch (urgency) {
            case 'Baixa': return { color: '#64748b', bg: '#f1f5f9', icon: 'stat_minus_1' };
            case 'Média': return { color: '#3b82f6', bg: '#dbeafe', icon: 'stat_2' };
            case 'Alta': return { color: '#f97316', bg: '#ffedd5', icon: 'priority_high' };
            case 'Urgente': return { color: '#ef4444', bg: '#fee2e2', icon: 'warning' };
            default: return { color: '#64748b', bg: '#f1f5f9', icon: 'horizontal_rule' };
        }
    };

    const getBatchStatusSummary = (batchOrders: OrderData[]) => {
        const counts: Record<string, number> = {};
        batchOrders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
        return counts;
    };

    const unitColors: Record<string,string> = { Barueri:'#8b5cf6', Osasco:'#f59e0b', SBC:'#10b981', SCS:'#ef4444' };

    const handleStatusSelect = (orderId: string, productName: string, newStatus: string) => {
        if (newStatus === 'Pedido') {
            setEtaModal({ id: orderId, productName });
            setEtaDate('');
        } else {
            onStatusChange(orderId, newStatus);
        }
    };

    const confirmEta = () => { if (etaModal) { onStatusChange(etaModal.id, 'Pedido', etaDate || undefined); setEtaModal(null); setEtaDate(''); } };
    const skipEta = () => { if (etaModal) { onStatusChange(etaModal.id, 'Pedido'); setEtaModal(null); setEtaDate(''); } };

    const formatEta = (eta?: string) => {
        if (!eta) return null;
        const d = new Date(eta);
        if (isNaN(d.getTime())) return null;
        const now = new Date();
        const diffMs = d.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (diffDays < 0) return { text: `${dateStr} (atrasado)`, color: '#ef4444' };
        if (diffDays === 0) return { text: `${dateStr} (hoje!)`, color: '#f59e0b' };
        if (diffDays === 1) return { text: `${dateStr} (amanhã)`, color: '#3b82f6' };
        return { text: `${dateStr} (${diffDays}d)`, color: '#3b82f6' };
    };

    const thS: React.CSSProperties = { padding: '14px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
    const tdS: React.CSSProperties = { padding: '14px 16px' };

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {batches.map((batch) => {
                    const isCollapsed = collapsedBatches.has(batch.batchNumber);
                    const statusSummary = getBatchStatusSummary(batch.orders);
                    const batchDate = batch.createdAt ? new Date(batch.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    const batchUnits = [...new Set(batch.orders.map(o => o.unit).filter(Boolean))];

                    return (
                        <div key={batch.batchNumber ?? 'null'} style={{
                            background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                            boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)',
                            overflow: 'hidden',
                        }}>
                            {/* Batch Header */}
                            <div
                                onClick={() => toggleBatch(batch.batchNumber)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '14px 20px', cursor: 'pointer',
                                    background: 'var(--bg)', borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
                                    transition: 'all 0.2s', userSelect: 'none',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', flexShrink: 0,
                                    }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>package_2</span>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                                Lote #{batch.batchNumber ?? '—'}
                                            </span>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '2px 10px', borderRadius: 20,
                                                background: 'var(--primary-light)', color: 'var(--primary)',
                                                fontSize: '0.72rem', fontWeight: 800,
                                            }}>
                                                {batch.itemCount} {batch.itemCount === 1 ? 'item' : 'itens'}
                                            </span>
                                            {/* Status badges */}
                                            {Object.entries(statusSummary).map(([status, count]) => {
                                                const cfg = getStatusConfig(status);
                                                return (
                                                    <span key={status} style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                        padding: '2px 8px', borderRadius: 12,
                                                        background: cfg.bg, color: cfg.text,
                                                        fontSize: '0.68rem', fontWeight: 800,
                                                    }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot }} />
                                                        {count} {status}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {batchDate}
                                            </span>
                                            {batchUnits.map(u => {
                                                const uc = unitColors[u || ''] || '#64748b';
                                                return (
                                                    <span key={u} style={{
                                                        fontSize: '0.68rem', fontWeight: 800, padding: '1px 6px',
                                                        borderRadius: 6, background: `${uc}15`, color: uc,
                                                    }}>
                                                        {u}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <span style={{ fontWeight: 900, fontSize: '1rem', color: batch.totalPrice > 0 ? '#10b981' : 'var(--text-muted)' }}>
                                        {batch.totalPrice > 0 ? fmtBRL(batch.totalPrice) : '—'}
                                    </span>
                                    <span className="material-symbols-outlined" style={{
                                        fontSize: 20, color: 'var(--text-muted)',
                                        transition: 'transform 0.2s',
                                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                    }}>expand_more</span>
                                </div>
                            </div>

                            {/* Batch Items Table */}
                            {!isCollapsed && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                                <th style={thS}>Produto</th>
                                                <th style={{ ...thS, textAlign: 'center' }}>Qtd</th>
                                                <th style={thS}>Unidade</th>
                                                <th style={{ ...thS, textAlign: 'right' }}>Preço Unit.</th>
                                                <th style={{ ...thS, textAlign: 'right' }}>Preço Total</th>
                                                <th style={thS}>Urgência</th>
                                                <th style={thS}>Status</th>
                                                <th style={thS}>Obs</th>
                                                <th style={{ ...thS, textAlign: 'right' }}>Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batch.orders.map((order) => {
                                                const statusCfg = getStatusConfig(order.status);
                                                const urgencyCfg = getUrgencyConfig(order.urgency);
                                                const eta = formatEta(order.estimatedArrival);
                                                const uColor = unitColors[order.unit || ''] || '#64748b';

                                                return (
                                                    <tr key={order.id} style={{ borderBottom: '1px solid var(--border)', transition: 'var(--transition)' }} className="hover-row">
                                                        <td style={tdS}>
                                                            <div>
                                                                <p style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem', margin: 0 }}>{order.productName}</p>
                                                                {order.sourceUrl && (
                                                                    <a href={order.sourceUrl} target="_blank" rel="noopener noreferrer"
                                                                        style={{ fontSize: '0.7rem', color: '#3b82f6', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                                                                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>link</span>
                                                                        Ver produto
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ ...tdS, textAlign: 'center' }}>
                                                            <span style={{ display: 'inline-block', background: 'var(--bg)', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 800, color: 'var(--text-main)', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                                                                {order.quantity}
                                                            </span>
                                                        </td>
                                                        <td style={tdS}>
                                                            {order.unit ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 800, background: `${uColor}12`, color: uColor, border: `1px solid ${uColor}25` }}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>apartment</span>
                                                                    {order.unit}
                                                                </span>
                                                            ) : '—'}
                                                        </td>
                                                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                                            {fmtBRL(order.unitPrice)}
                                                        </td>
                                                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 800, fontSize: '0.88rem', color: order.totalPrice ? '#10b981' : 'var(--text-muted)' }}>
                                                            {fmtBRL(order.totalPrice)}
                                                        </td>
                                                        <td style={tdS}>
                                                            <div style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                                padding: '3px 8px', borderRadius: 'var(--radius-md)',
                                                                background: urgencyCfg.bg, color: urgencyCfg.color,
                                                                fontSize: '0.78rem', fontWeight: 800
                                                            }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{urgencyCfg.icon}</span>
                                                                {order.urgency}
                                                            </div>
                                                        </td>
                                                        <td style={tdS}>
                                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                                <select
                                                                    value={order.status}
                                                                    onChange={(e) => order.id && handleStatusSelect(order.id, order.productName, e.target.value)}
                                                                    style={{
                                                                        padding: '5px 34px 5px 28px', borderRadius: 'var(--radius-full)',
                                                                        border: `1px solid ${statusCfg.text}30`, backgroundColor: statusCfg.bg,
                                                                        color: statusCfg.text, fontWeight: 800, fontFamily: 'inherit',
                                                                        fontSize: '0.8rem', cursor: 'pointer', outline: 'none',
                                                                        appearance: 'none', minWidth: 140,
                                                                        backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="${encodeURIComponent(statusCfg.text)}" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>')`,
                                                                        backgroundRepeat: 'no-repeat', backgroundPositionX: 'calc(100% - 8px)', backgroundPositionY: 'center',
                                                                    }}
                                                                >
                                                                    <option value="Aguardando">Aguardando</option>
                                                                    <option value="Pedido">Pedido Feito</option>
                                                                    <option value="Entregue">Entregue</option>
                                                                    <option value="Cancelado">Cancelado</option>
                                                                </select>
                                                                <span style={{
                                                                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                                                                    width: 7, height: 7, borderRadius: '50%', background: statusCfg.dot, pointerEvents: 'none'
                                                                }}></span>
                                                            </div>
                                                            {eta && (
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, padding: '1px 6px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: `${eta.color}15`, color: eta.color, border: `1px solid ${eta.color}25` }}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 11 }}>schedule</span>
                                                                    {eta.text}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ ...tdS, maxWidth: 160 }}>
                                                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }} title={order.notes}>{order.notes || '—'}</p>
                                                        </td>
                                                        <td style={{ ...tdS, textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                                <button onClick={() => onEdit(order)} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', transition: 'var(--transition)' }} className="hover-btn" title="Editar">
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                                                                </button>
                                                                <button onClick={() => order.id && onDelete(order.id)} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', transition: 'var(--transition)' }} className="hover-btn-danger" title="Excluir">
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <style>{`
                .hover-row:hover { background: var(--bg); }
                .hover-btn:hover { background: var(--bg); color: var(--text-main) !important; }
                .hover-btn-danger:hover { background: #fee2e2; color: #ef4444 !important; }
            `}</style>

            {/* ETA Modal */}
            {etaModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 0.15s ease' }} onClick={() => { setEtaModal(null); setEtaDate(''); }}>
                    <div style={{ background: 'var(--card-bg)', width: '100%', maxWidth: 420, borderRadius: 20, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.15)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#3b82f6,#60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>local_shipping</span>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Pedido Feito!</h3>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>{etaModal.productName}</p>
                            </div>
                        </div>
                        <div style={{ marginBottom: 24 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#3b82f6' }}>event</span>
                                Previsão de chegada
                            </label>
                            <input type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid var(--border)', background: 'var(--bg)', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, outline: 'none', color: 'var(--text-main)' }} />
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>Quando o pedido deve chegar? (opcional)</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={skipEta} style={{ flex: 1, padding: '12px 0', borderRadius: 12, background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>Pular</button>
                            <button onClick={confirmEta} style={{ flex: 2, padding: '12px 0', borderRadius: 12, background: 'linear-gradient(135deg,#3b82f6,#60a5fa)', color: '#fff', border: 'none', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                                    {etaDate ? 'Confirmar com Previsão' : 'Confirmar sem Data'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
