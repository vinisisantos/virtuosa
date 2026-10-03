'use client';

import { useState } from 'react';
import { OrderData } from './order-modal';
import { DatePicker } from '@/components/ui/date-picker';
import { formatCurrency } from '@/lib/currency';
import type { OrdersViewMode } from '@/hooks/useOrdersViewPreference';

interface OrdersTableProps {
    orders: OrderData[];
    viewMode: OrdersViewMode;
    onEdit: (order: OrderData) => void;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, newStatus: string, estimatedArrival?: string) => void;
    onCostRecognition?: (order: OrderData) => void;
}

function fmtBRL(v?: number) {
    if (v === undefined || v === null) return '—';
    return formatCurrency(v);
}

function formatCostDate(value?: string | null) {
    const dateOnly = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dateOnly) return '';
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
}

interface BatchGroup {
    batchNumber: number | null;
    orders: OrderData[];
    totalPrice: number;
    createdAt: string;
    itemCount: number;
}

export function OrdersTable({ orders, viewMode, onEdit, onDelete, onStatusChange, onCostRecognition }: OrdersTableProps) {
    const [etaModal, setEtaModal] = useState<{id: string, productName: string} | null>(null);
    const [etaDate, setEtaDate] = useState('');
    const [collapsedBatches, setCollapsedBatches] = useState<Set<number | null>>(new Set());
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [selectedBatchKey, setSelectedBatchKey] = useState<string | null>(null);

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

    const getBatchKey = (batch: BatchGroup) => batch.batchNumber === null ? 'unbatched' : String(batch.batchNumber);
    const activeBatchKey = batches.some(batch => getBatchKey(batch) === selectedBatchKey)
        ? selectedBatchKey
        : getBatchKey(batches[0]);

    const toggleOrder = (orderKey: string) => {
        setExpandedOrders(previous => {
            const next = new Set(previous);
            if (next.has(orderKey)) next.delete(orderKey);
            else next.add(orderKey);
            return next;
        });
    };

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
        // Fix: date-only strings like "2026-06-19" are parsed as UTC midnight,
        // which shifts to previous day in BRT. Append T12:00:00 to avoid this.
        const safeEta = eta.length === 10 ? `${eta}T12:00:00` : eta;
        const d = new Date(safeEta);
        if (isNaN(d.getTime())) return null;
        const now = new Date();
        now.setHours(12, 0, 0, 0);
        const diffMs = d.getTime() - now.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (diffDays < 0) return { text: `${dateStr} (atrasado)`, color: '#ef4444' };
        if (diffDays === 0) return { text: `${dateStr} (hoje!)`, color: '#f59e0b' };
        if (diffDays === 1) return { text: `${dateStr} (amanhã)`, color: '#3b82f6' };
        return { text: `${dateStr} (${diffDays}d)`, color: '#3b82f6' };
    };

    return (
        <>
            <div className={`orders-board orders-board-${viewMode}`}>
                {viewMode === 'compact' && (
                    <aside className="orders-batch-sidebar" aria-label="Lotes em andamento">
                        <h3>Lotes em andamento</h3>
                        {batches.map(batch => {
                            const batchKey = getBatchKey(batch);
                            const waiting = batch.orders.filter(order => order.status === 'Aguardando').length;
                            return (
                                <button key={batchKey} type="button" className="orders-batch-choice"
                                    aria-pressed={activeBatchKey === batchKey}
                                    onClick={() => setSelectedBatchKey(batchKey)}>
                                    <span><strong>Lote #{batch.batchNumber ?? '—'}</strong><small>{batch.itemCount} {batch.itemCount === 1 ? 'item' : 'itens'} · {batch.orders[0]?.unit || 'Todas'}</small></span>
                                    <span className="orders-choice-count">{waiting ? `${waiting} aguardando` : 'Sem pendências'}</span>
                                </button>
                            );
                        })}
                    </aside>
                )}
                <div className="orders-batches">
                {batches.map((batch) => {
                    if (viewMode === 'compact' && getBatchKey(batch) !== activeBatchKey) return null;
                    const isCollapsed = collapsedBatches.has(batch.batchNumber);
                    const statusSummary = getBatchStatusSummary(batch.orders);
                    const batchDate = batch.createdAt ? new Date(batch.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    const batchUnits = [...new Set(batch.orders.map(o => o.unit).filter(Boolean))];

                    return (
                        <div key={batch.batchNumber ?? 'null'} className="orders-batch" style={{
                            background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                            boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)',
                            overflow: 'hidden',
                        }}>
                            {/* Batch Header */}
                            <button type="button"
                                onClick={() => toggleBatch(batch.batchNumber)}
                                className="orders-batch-header"
                                aria-expanded={!isCollapsed}
                                aria-label={`Lote ${batch.batchNumber ?? 'sem número'}: ${isCollapsed ? 'expandir' : 'recolher'} itens`}
                                style={{
                                    padding: '14px 20px', cursor: 'pointer', width: '100%',
                                    background: 'var(--bg)', borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
                                    transition: 'all 0.2s', userSelect: 'none', borderTop: 0, borderLeft: 0, borderRight: 0, textAlign: 'left', fontFamily: 'inherit',
                                }}
                            >
                                <div className="orders-batch-main">
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', flexShrink: 0,
                                    }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>package_2</span>
                                    </div>
                                    <div className="orders-batch-copy">
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
                                <div className="orders-batch-summary">
                                    <span style={{ fontWeight: 900, fontSize: '1rem', color: batch.totalPrice > 0 ? '#10b981' : 'var(--text-muted)' }}>
                                        {batch.totalPrice > 0 ? fmtBRL(batch.totalPrice) : '—'}
                                    </span>
                                    <span className="material-symbols-outlined" style={{
                                        fontSize: 20, color: 'var(--text-muted)',
                                        transition: 'transform 0.2s',
                                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                    }}>expand_more</span>
                                </div>
                            </button>

                            {/* Batch items adapt to the available width without horizontal scrolling. */}
                            {!isCollapsed && (
                                <div className="orders-items-list">
                                    {batch.orders.map((order, orderIndex) => {
                                                const orderKey = order.id || `${getBatchKey(batch)}-${orderIndex}`;
                                                const statusCfg = getStatusConfig(order.status);
                                                const urgencyCfg = getUrgencyConfig(order.urgency);
                                                const eta = formatEta(order.estimatedArrival);
                                                const uColor = unitColors[order.unit || ''] || '#64748b';
                                                const isCostRecognized = Boolean(order.costRecognizedAt);
                                                const hasFinancialValue = Boolean(order.totalPrice && order.totalPrice > 0);
                                                const isCostSuspended = isCostRecognized && (!hasFinancialValue || order.status === 'Cancelado');
                                                const recognitionUnavailable = !isCostRecognized && (!hasFinancialValue || order.status === 'Cancelado');

                                                return (
                                                    <article key={orderKey} className="orders-item-card" data-expanded={viewMode === 'detailed' || expandedOrders.has(orderKey)}>
                                                        <div className="orders-field orders-product-field">
                                                            <span className="orders-field-label">Produto</span>
                                                            <div className="orders-product-content">
                                                                <p style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem', margin: 0 }}>{order.productName}</p>
                                                                {order.sourceUrl && (
                                                                    <a href={order.sourceUrl} target="_blank" rel="noopener noreferrer"
                                                                        style={{ fontSize: '0.7rem', color: '#3b82f6', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                                                                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>link</span>
                                                                        Ver produto
                                                                    </a>
                                                                )}
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: 5, marginTop: 7 }}>
                                                                    {isCostRecognized && (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 7, background: isCostSuspended ? '#fef3c7' : 'rgba(16,185,129,0.12)', color: isCostSuspended ? '#92400e' : '#10b981', fontSize: '0.68rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                                                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{isCostSuspended ? 'warning' : 'account_balance_wallet'}</span>
                                                                            {isCostSuspended ? 'Fora de Custos' : 'Em Custos'} · {formatCostDate(order.costRecognizedAt)}
                                                                        </span>
                                                                    )}
                                                                    {onCostRecognition && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => onCostRecognition(order)}
                                                                            disabled={recognitionUnavailable}
                                                                            title={
                                                                                order.status === 'Cancelado' && !isCostRecognized
                                                                                    ? 'Pedido cancelado não pode ser lançado em Custos'
                                                                                    : !hasFinancialValue && !isCostRecognized
                                                                                        ? 'Informe o preço total para lançar em Custos'
                                                                                        : isCostRecognized ? 'Corrigir data ou remover de Custos' : 'Lançar na categoria Produtos em Custos'
                                                                            }
                                                                            style={{
                                                                                minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 5,
                                                                                padding: '0 9px', borderRadius: 8,
                                                                                border: `1px solid ${recognitionUnavailable ? 'var(--border)' : 'rgba(16,185,129,0.28)'}`,
                                                                                background: recognitionUnavailable ? 'var(--bg)' : 'rgba(16,185,129,0.08)',
                                                                                color: recognitionUnavailable ? 'var(--text-muted)' : '#10b981',
                                                                                fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 800,
                                                                                cursor: recognitionUnavailable ? 'not-allowed' : 'pointer', opacity: recognitionUnavailable ? 0.65 : 1,
                                                                            }}
                                                                        >
                                                                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{isCostRecognized ? 'edit_calendar' : 'add_card'}</span>
                                                                            {isCostRecognized ? 'Ajustar custo' : 'Lançar em custos'}
                                                                        </button>
                                                                    )}
                                                                    {onCostRecognition && !isCostRecognized && !hasFinancialValue && order.status !== 'Cancelado' && (
                                                                        <span style={{ maxWidth: 190, color: '#b45309', fontSize: '0.66rem', fontWeight: 700, lineHeight: 1.35 }}>
                                                                            Informe o preço total primeiro.
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="orders-field orders-quantity-field">
                                                            <span className="orders-field-label">Quantidade</span>
                                                            <span style={{ display: 'inline-block', background: 'var(--bg)', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 800, color: 'var(--text-main)', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                                                                {order.quantity}
                                                            </span>
                                                        </div>

                                                        <div className="orders-field orders-unit-field">
                                                            <span className="orders-field-label">Unidade</span>
                                                            {order.unit ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 800, background: `${uColor}12`, color: uColor, border: `1px solid ${uColor}25` }}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>apartment</span>
                                                                    {order.unit}
                                                                </span>
                                                            ) : '—'}
                                                        </div>

                                                        <div className="orders-field orders-unit-price-field">
                                                            <span className="orders-field-label">Preço unitário</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                                            {fmtBRL(order.unitPrice)}
                                                            </span>
                                                        </div>

                                                        <div className="orders-field orders-total-field">
                                                            <span className="orders-field-label">Preço total</span>
                                                            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: order.totalPrice ? '#10b981' : 'var(--text-muted)' }}>
                                                            {fmtBRL(order.totalPrice)}
                                                            </span>
                                                        </div>

                                                        <div className="orders-field orders-urgency-field">
                                                            <span className="orders-field-label">Urgência</span>
                                                            <div style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                                padding: '3px 8px', borderRadius: 'var(--radius-md)',
                                                                background: urgencyCfg.bg, color: urgencyCfg.color,
                                                                fontSize: '0.78rem', fontWeight: 800
                                                            }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{urgencyCfg.icon}</span>
                                                                {order.urgency}
                                                            </div>
                                                        </div>

                                                        <div className="orders-field orders-status-field">
                                                            <span className="orders-field-label">Status</span>
                                                            <div className="orders-status-control">
                                                                <select
                                                                    value={order.status}
                                                                    onChange={(e) => order.id && handleStatusSelect(order.id, order.productName, e.target.value)}
                                                                    title={isCostRecognized ? 'Remova de Custos antes de cancelar o pedido' : undefined}
                                                                    style={{
                                                                        padding: '5px 34px 5px 28px', borderRadius: 'var(--radius-full)',
                                                                        border: `1px solid ${statusCfg.text}30`, backgroundColor: statusCfg.bg,
                                                                        color: statusCfg.text, fontWeight: 800, fontFamily: 'inherit',
                                                                        fontSize: '0.8rem', cursor: 'pointer', outline: 'none',
                                                                        appearance: 'none', width: '100%', minWidth: 0,
                                                                        backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="${encodeURIComponent(statusCfg.text)}" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>')`,
                                                                        backgroundRepeat: 'no-repeat', backgroundPositionX: 'calc(100% - 8px)', backgroundPositionY: 'center',
                                                                    }}
                                                                >
                                                                    <option value="Aguardando">Aguardando</option>
                                                                    <option value="Pedido">Pedido Feito</option>
                                                                    <option value="Entregue">Entregue</option>
                                                                    <option value="Cancelado" disabled={isCostRecognized}>Cancelado</option>
                                                                </select>
                                                                <span style={{
                                                                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                                                                    width: 7, height: 7, borderRadius: '50%', background: statusCfg.dot, pointerEvents: 'none'
                                                                }}></span>
                                                            </div>
                                                            {eta && (
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 5, padding: '1px 6px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: `${eta.color}15`, color: eta.color, border: `1px solid ${eta.color}25` }}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 11 }}>schedule</span>
                                                                    {eta.text}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {viewMode === 'compact' && (
                                                            <button type="button" className="orders-quick-action" onClick={() => onEdit(order)}>
                                                                {hasFinancialValue ? 'Conferir item' : 'Informar preço'}
                                                            </button>
                                                        )}
                                                        {viewMode === 'compact' && (
                                                            <button type="button" className="orders-detail-toggle"
                                                                aria-expanded={expandedOrders.has(orderKey)} onClick={() => toggleOrder(orderKey)}>
                                                                {expandedOrders.has(orderKey) ? 'Ocultar detalhes e ações' : 'Ver detalhes e ações'}
                                                                <span className="material-symbols-outlined" aria-hidden="true">{expandedOrders.has(orderKey) ? 'expand_less' : 'expand_more'}</span>
                                                            </button>
                                                        )}

                                                        <div className="orders-field orders-notes-field">
                                                            <span className="orders-field-label">Observações</span>
                                                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', overflowWrap: 'anywhere', margin: 0 }}>{order.notes || '—'}</p>
                                                        </div>

                                                        <div className="orders-field orders-actions-field">
                                                            <span className="orders-field-label">Ações</span>
                                                            <div className="orders-actions">
                                                                <button onClick={() => onEdit(order)} className="orders-action-button hover-btn" title="Editar">
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                                                                    <span>Editar</span>
                                                                </button>
                                                                <button onClick={() => order.id && onDelete(order.id)} disabled={isCostRecognized} style={{ cursor: isCostRecognized ? 'not-allowed' : 'pointer', opacity: isCostRecognized ? 0.45 : 1 }} className="orders-action-button hover-btn-danger" title={isCostRecognized ? 'Remova de Custos antes de excluir' : 'Excluir'}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                                                    <span>Excluir</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </article>
                                                );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
                </div>
            </div>

            <style>{`
                .orders-board { min-width: 0; }
                .orders-board-compact { display: grid; grid-template-columns: minmax(210px, 260px) minmax(0, 1fr); align-items: start; gap: 14px; }
                .orders-batch-sidebar { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card-bg); }
                .orders-batch-sidebar h3 { margin: 0 0 2px; color: var(--text-main); font-size: 0.9rem; }
                .orders-batch-choice { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; width: 100%; min-width: 0; min-height: 68px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-main); text-align: left; cursor: pointer; font-family: inherit; }
                .orders-batch-choice[aria-pressed="true"] { border-color: var(--primary); background: var(--primary-light); }
                .orders-batch-choice > span:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
                .orders-batch-choice strong { font-size: 0.82rem; }
                .orders-batch-choice small { color: var(--text-muted); font-size: 0.73rem; }
                .orders-choice-count { color: var(--text-muted); font-size: 0.7rem; font-weight: 700; text-align: right; }
                .orders-batches { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
                .orders-batch { min-width: 0; }
                .orders-batch-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
                .orders-batch-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
                .orders-batch-copy { min-width: 0; }
                .orders-batch-summary { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-width: 0; }
                .orders-items-list { display: flex; flex-direction: column; min-width: 0; }
                .orders-item-card { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); align-items: start; gap: 12px; margin: 9px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in srgb, var(--card-bg) 82%, var(--bg)); min-width: 0; transition: var(--transition); }
                .orders-item-card:last-child { border-bottom: 0; }
                .orders-item-card:last-child { border-bottom: 1px solid var(--border); }
                .orders-item-card:hover { border-color: color-mix(in srgb, var(--primary) 35%, var(--border)); }
                .orders-field { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; min-width: 0; }
                .orders-field-label { color: var(--text-muted); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.04em; line-height: 1.2; text-transform: uppercase; }
                .orders-product-field { grid-column: span 5; }
                .orders-product-content { min-width: 0; width: 100%; }
                .orders-product-content > div { min-width: 0; }
                .orders-quantity-field { grid-column: span 1; }
                .orders-total-field, .orders-urgency-field, .orders-status-field { grid-column: span 2; }
                .orders-unit-field, .orders-unit-price-field { grid-column: span 2; }
                .orders-notes-field { grid-column: 1 / -1; padding-top: 2px; }
                .orders-actions-field { grid-column: span 4; }
                .orders-status-control { position: relative; width: 100%; min-width: 0; }
                .orders-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; width: 100%; }
                .orders-action-button { min-height: 40px; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 0 9px; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text-muted); font-family: inherit; font-size: 0.72rem; font-weight: 800; line-height: 1; cursor: pointer; transition: var(--transition); }
                .orders-detail-toggle { grid-column: 1 / -1; display: inline-flex; align-items: center; justify-content: flex-start; gap: 5px; width: fit-content; min-height: 36px; padding: 4px 0; border: 0; background: transparent; color: var(--primary); font-family: inherit; font-size: 0.78rem; font-weight: 800; cursor: pointer; }
                .orders-detail-toggle .material-symbols-outlined { font-size: 17px; }
                .orders-quick-action { grid-column: 1 / -1; min-height: 42px; border: 1px solid color-mix(in srgb, var(--primary) 45%, var(--border)); border-radius: 9px; background: var(--primary-light); color: var(--primary); font-family: inherit; font-size: 0.8rem; font-weight: 800; cursor: pointer; }
                .orders-board-compact .orders-product-field { grid-column: span 4; }
                .orders-board-compact .orders-quantity-field { grid-column: span 1; }
                .orders-board-compact .orders-total-field, .orders-board-compact .orders-urgency-field { grid-column: span 2; }
                .orders-board-compact .orders-status-field { grid-column: span 3; }
                .orders-board-compact .orders-quick-action { grid-column: 1 / span 5; }
                .orders-board-compact .orders-detail-toggle { grid-column: 6 / -1; }
                .orders-board-compact .orders-item-card[data-expanded="false"] .orders-unit-field, .orders-board-compact .orders-item-card[data-expanded="false"] .orders-unit-price-field, .orders-board-compact .orders-item-card[data-expanded="false"] .orders-notes-field, .orders-board-compact .orders-item-card[data-expanded="false"] .orders-actions-field, .orders-board-compact .orders-item-card[data-expanded="false"] .orders-product-content > div { display: none; }
                .hover-btn:hover { background: var(--bg); color: var(--text-main) !important; }
                .hover-btn-danger:hover { background: #fee2e2; color: #ef4444 !important; }

                @media (max-width: 1199px) {
                    .orders-board-compact { grid-template-columns: minmax(0, 1fr); }
                    .orders-batch-sidebar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
                    .orders-batch-sidebar h3 { grid-column: 1 / -1; }
                    .orders-item-card { grid-template-columns: repeat(4, minmax(0, 1fr)); }
                    .orders-product-field { grid-column: 1 / -1; }
                    .orders-quantity-field, .orders-total-field, .orders-urgency-field, .orders-status-field { grid-column: span 1; }
                    .orders-unit-field, .orders-unit-price-field { grid-column: span 2; }
                    .orders-actions-field { grid-column: span 2; }
                    .orders-board-compact .orders-product-field { grid-column: 1 / -1; }
                    .orders-board-compact .orders-quantity-field, .orders-board-compact .orders-total-field, .orders-board-compact .orders-urgency-field, .orders-board-compact .orders-status-field { grid-column: span 1; }
                    .orders-board-compact .orders-quick-action { grid-column: 1 / span 2; }
                    .orders-board-compact .orders-detail-toggle { grid-column: 3 / -1; }
                }

                @media (max-width: 720px) {
                    .orders-batch-header { grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 14px !important; }
                    .orders-batch-main { align-items: flex-start; }
                    .orders-batch-summary { justify-content: space-between; padding-left: 48px; }
                    .orders-item-card { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px 10px; padding: 13px; }
                    .orders-product-field, .orders-status-field, .orders-notes-field, .orders-actions-field { grid-column: 1 / -1; }
                    .orders-quantity-field, .orders-unit-field, .orders-unit-price-field, .orders-total-field, .orders-urgency-field { grid-column: span 1; }
                    .orders-actions { gap: 8px; }
                    .orders-action-button { min-height: 44px; font-size: 0.78rem; }
                    .orders-batch-sidebar { grid-template-columns: minmax(0, 1fr); }
                    .orders-batch-sidebar h3 { grid-column: 1; }
                    .orders-board-compact .orders-product-field, .orders-board-compact .orders-status-field { grid-column: 1 / -1; }
                    .orders-board-compact .orders-quantity-field, .orders-board-compact .orders-total-field, .orders-board-compact .orders-urgency-field { grid-column: span 1; }
                    .orders-board-compact .orders-quick-action { grid-column: 1; }
                    .orders-board-compact .orders-detail-toggle { grid-column: 2; }
                }

                @media (max-width: 380px) {
                    .orders-batch-summary { padding-left: 0; }
                }
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
                            <DatePicker value={etaDate} onChange={setEtaDate} variant="input" placeholder="Previsão de chegada" />
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
