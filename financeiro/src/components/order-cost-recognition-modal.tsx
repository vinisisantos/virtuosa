'use client';

import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { formatCurrency } from '@/lib/currency';
import type { OrderData } from '@/components/order-modal';

interface OrderCostRecognitionModalProps {
    order: OrderData;
    saving: boolean;
    onClose: () => void;
    onChange: (costRecognizedAt: string | null) => Promise<void>;
}

function todayAsDateInput() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function costDateAsInput(value?: string | null) {
    if (!value) return '';
    const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return dateOnly?.[1] || '';
}

function getUnavailableReason(order: OrderData) {
    if (order.status === 'Cancelado') {
        return order.costRecognizedAt
            ? 'Este pedido está cancelado e não soma em Custos. Remova o vínculo abaixo ou reative o pedido antes de corrigir a data.'
            : 'Pedidos cancelados não podem ser lançados em Custos.';
    }
    if (!order.totalPrice || order.totalPrice <= 0) {
        return order.costRecognizedAt
            ? 'Este pedido está sem valor e não soma em Custos. Remova o vínculo abaixo ou informe o preço total antes de corrigir a data.'
            : 'Informe um preço total maior que zero antes do lançamento.';
    }
    return null;
}

export function OrderCostRecognitionModal({ order, saving, onClose, onChange }: OrderCostRecognitionModalProps) {
    const [costDate, setCostDate] = useState(() => costDateAsInput(order.costRecognizedAt) || todayAsDateInput());
    const [error, setError] = useState<string | null>(null);
    const [confirmingRemoval, setConfirmingRemoval] = useState(false);
    const isRecognized = Boolean(order.costRecognizedAt);
    const unavailableReason = getUnavailableReason(order);
    const canSave = Boolean(costDate) && !unavailableReason && !saving;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !saving) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, saving]);

    const saveCostDate = async () => {
        if (!canSave) return;
        setError(null);
        try {
            await onChange(costDate);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o custo do pedido.');
        }
    };

    const removeFromCosts = async () => {
        if (saving) return;
        setError(null);
        try {
            await onChange(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível remover o pedido dos custos.');
        }
    };

    const closeModal = () => {
        if (!saving) onClose();
    };

    return (
        <div
            className="order-cost-overlay"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeModal();
            }}
        >
            <section
                className="order-cost-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="order-cost-title"
            >
                <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(16,185,129,0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 23 }}>account_balance_wallet</span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h2 id="order-cost-title" style={{ margin: 0, fontSize: '1.08rem', fontWeight: 900, color: 'var(--text-main)' }}>
                                {isRecognized ? 'Editar lançamento em Custos' : 'Lançar em Custos'}
                            </h2>
                            <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.4 }}>
                                Este pedido será somado na categoria Produtos no mês da data escolhida.
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={closeModal} disabled={saving} aria-label="Fechar" className="order-cost-close">
                        <span className="material-symbols-outlined" style={{ fontSize: 21 }}>close</span>
                    </button>
                </header>

                <div style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 13, padding: 14, marginBottom: 18 }}>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Pedido</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                        <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{order.productName}</strong>
                        <strong style={{ color: order.totalPrice && order.totalPrice > 0 ? '#10b981' : 'var(--text-muted)', fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                            {order.totalPrice && order.totalPrice > 0 ? formatCurrency(order.totalPrice) : 'Sem valor'}
                        </strong>
                    </div>
                </div>

                {unavailableReason && (
                    <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 12px', marginBottom: 16, borderRadius: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.78rem', lineHeight: 1.45, fontWeight: 700 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, flexShrink: 0 }}>warning</span>
                        {unavailableReason}
                    </div>
                )}

                <div style={{ marginBottom: error ? 12 : 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--text-muted)', fontSize: '0.73rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#10b981' }}>event</span>
                        Data do custo
                    </label>
                    <DatePicker value={costDate} onChange={setCostDate} variant="input" placeholder="Selecione a data" />
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.4 }}>
                        A data define em qual mês o pedido aparecerá em Custos.
                    </p>
                </div>

                {error && (
                    <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', marginBottom: 16, borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: '0.78rem', lineHeight: 1.4, fontWeight: 700 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>error</span>
                        {error}
                    </div>
                )}

                {confirmingRemoval ? (
                    <div style={{ borderRadius: 12, background: '#fff1f2', border: '1px solid #fecdd3', padding: 13 }}>
                        <p style={{ margin: '0 0 12px', color: '#9f1239', fontSize: '0.8rem', fontWeight: 800, lineHeight: 1.45 }}>
                            Remover este pedido de Custos? O pedido continuará cadastrado e poderá ser lançado novamente depois.
                        </p>
                        <div className="order-cost-actions">
                            <button type="button" onClick={() => setConfirmingRemoval(false)} disabled={saving} className="order-cost-secondary">Voltar</button>
                            <button type="button" onClick={removeFromCosts} disabled={saving} className="order-cost-danger">
                                {saving ? 'Removendo...' : 'Confirmar remoção'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <footer className="order-cost-footer">
                        {isRecognized && (
                            <button type="button" onClick={() => setConfirmingRemoval(true)} disabled={saving} className="order-cost-remove">
                                Remover de Custos
                            </button>
                        )}
                        <div className="order-cost-actions">
                            <button type="button" onClick={closeModal} disabled={saving} className="order-cost-secondary">Cancelar</button>
                            <button type="button" onClick={saveCostDate} disabled={!canSave} className="order-cost-primary">
                                {saving ? 'Salvando...' : isRecognized ? 'Atualizar data' : 'Lançar em Custos'}
                            </button>
                        </div>
                    </footer>
                )}
            </section>

            <style>{`
                .order-cost-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    background: rgba(0, 0, 0, 0.52);
                    backdrop-filter: blur(8px);
                }
                .order-cost-card {
                    width: 100%;
                    max-width: 470px;
                    max-height: min(760px, calc(100dvh - 40px));
                    overflow-y: auto;
                    border-radius: 20px;
                    border: 1px solid var(--border);
                    background: var(--card-bg);
                    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
                    padding: 24px;
                }
                .order-cost-close {
                    width: 44px;
                    height: 44px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    background: var(--bg);
                    color: var(--text-muted);
                    cursor: pointer;
                }
                .order-cost-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border);
                }
                .order-cost-actions {
                    display: flex;
                    gap: 10px;
                    margin-left: auto;
                }
                .order-cost-primary,
                .order-cost-secondary,
                .order-cost-danger,
                .order-cost-remove {
                    min-height: 44px;
                    border-radius: 11px;
                    padding: 0 15px;
                    border: none;
                    font-family: inherit;
                    font-size: 0.82rem;
                    font-weight: 800;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .order-cost-primary { background: #10b981; color: #fff; }
                .order-cost-secondary { background: var(--bg); color: var(--text-main); border: 1px solid var(--border); }
                .order-cost-danger { background: #e11d48; color: #fff; }
                .order-cost-remove { padding: 0; background: transparent; color: #e11d48; }
                .order-cost-primary:disabled,
                .order-cost-secondary:disabled,
                .order-cost-danger:disabled,
                .order-cost-remove:disabled,
                .order-cost-close:disabled { opacity: 0.55; cursor: not-allowed; }
                @media (max-width: 640px) {
                    .order-cost-overlay { align-items: flex-end; padding: 12px 0 0; }
                    .order-cost-card {
                        max-height: calc(100dvh - 12px);
                        border-radius: 20px 20px 0 0;
                        border-bottom: none;
                        padding: 20px 16px max(18px, env(safe-area-inset-bottom));
                    }
                    .order-cost-footer { align-items: stretch; flex-direction: column-reverse; }
                    .order-cost-actions { width: 100%; margin-left: 0; }
                    .order-cost-actions > button { flex: 1; }
                    .order-cost-remove { width: 100%; padding: 0 12px; }
                }
            `}</style>
        </div>
    );
}
