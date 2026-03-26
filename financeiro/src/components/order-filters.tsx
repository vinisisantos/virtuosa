'use client';
import { useState } from 'react';

export interface OrderFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    statusFilter: string;
    onStatusChange: (status: string) => void;
    urgencyFilter: string;
    onUrgencyChange: (urgency: string) => void;
}

const STATUS_OPTIONS = [
    { value: 'All', label: 'Todos', icon: 'checklist' },
    { value: 'Aguardando', label: 'Aguardando', icon: 'hourglass_top', color: '#f59e0b' },
    { value: 'Pedido', label: 'Pedido Feito', icon: 'local_shipping', color: '#3b82f6' },
    { value: 'Entregue', label: 'Entregue', icon: 'check_circle', color: '#10b981' },
    { value: 'Cancelado', label: 'Cancelado', icon: 'cancel', color: '#ef4444' },
];

const URGENCY_OPTIONS = [
    { value: 'All', label: 'Todas', icon: 'tune' },
    { value: 'Baixa', label: 'Baixa', icon: 'arrow_downward', color: '#10b981' },
    { value: 'Média', label: 'Média', icon: 'remove', color: '#f59e0b' },
    { value: 'Alta', label: 'Alta', icon: 'arrow_upward', color: '#f97316' },
    { value: 'Urgente', label: 'Urgente', icon: 'priority_high', color: '#ef4444' },
];

export function OrderFilters({
    searchQuery, onSearchChange,
    statusFilter, onStatusChange,
    urgencyFilter, onUrgencyChange
}: OrderFiltersProps) {
    const [showStatus, setShowStatus] = useState(false);
    const [showUrgency, setShowUrgency] = useState(false);

    const activeStatus = STATUS_OPTIONS.find(s => s.value === statusFilter) || STATUS_OPTIONS[0];
    const activeUrgency = URGENCY_OPTIONS.find(u => u.value === urgencyFilter) || URGENCY_OPTIONS[0];

    const pillStyle = (isOpen: boolean) => ({
        display: 'flex' as const, alignItems: 'center' as const, gap: 8,
        padding: '9px 16px', borderRadius: 12,
        border: isOpen ? '1px solid var(--primary)' : '1px solid var(--border)',
        background: isOpen ? 'rgba(230,0,126,0.06)' : 'var(--bg)',
        color: 'var(--text-main)', fontWeight: 700 as const, fontSize: '0.85rem',
        cursor: 'pointer' as const, fontFamily: 'inherit' as const,
        transition: 'all 0.2s',
        boxShadow: isOpen ? '0 0 0 3px rgba(230,0,126,0.1)' : 'none',
    });

    return (
        <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
            background: 'var(--card-bg)', padding: '16px 20px',
            borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            border: '1px solid var(--border)', marginBottom: 24,
        }}>
            {/* Search Input */}
            <div style={{ flex: '1 1 300px', position: 'relative' }}>
                <span className="material-symbols-outlined" style={{
                    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--primary)', fontSize: 18
                }}>search</span>
                <input
                    type="text"
                    placeholder="Buscar produto por nome..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    style={{
                        width: '100%', padding: '11px 14px 11px 42px', borderRadius: 12,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        fontFamily: 'inherit', fontSize: '0.88rem', outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s', color: 'var(--text-main)',
                    }}
                />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Status Picker */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => { setShowStatus(!showStatus); setShowUrgency(false); }} style={pillStyle(showStatus)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: activeStatus.color || 'var(--primary)' }}>{activeStatus.icon}</span>
                        {activeStatus.label}
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showStatus ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                    </button>
                    {showStatus && (
                        <>
                            <div onClick={() => setShowStatus(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
                                background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)',
                                boxShadow: '0 16px 48px rgba(0,0,0,0.12)', width: 200, overflow: 'hidden',
                                animation: 'fadeIn 0.15s ease', padding: 8,
                            }}>
                                {STATUS_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => { onStatusChange(opt.value); setShowStatus(false); }} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10,
                                        border: 'none', background: statusFilter === opt.value ? 'linear-gradient(135deg,var(--primary),#ff4db1)' : 'transparent',
                                        color: statusFilter === opt.value ? '#fff' : 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem',
                                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'left' as const,
                                    }}
                                    onMouseEnter={e => { if (statusFilter !== opt.value) (e.currentTarget).style.background = 'var(--bg)'; }}
                                    onMouseLeave={e => { if (statusFilter !== opt.value) (e.currentTarget).style.background = 'transparent'; }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: statusFilter === opt.value ? '#fff' : (opt.color || 'var(--text-muted)') }}>{opt.icon}</span>
                                        {opt.label}
                                        {statusFilter === opt.value && <span className="material-symbols-outlined" style={{ fontSize: 14, marginLeft: 'auto' }}>check</span>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Urgency Picker */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => { setShowUrgency(!showUrgency); setShowStatus(false); }} style={pillStyle(showUrgency)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: activeUrgency.color || 'var(--primary)' }}>{activeUrgency.icon}</span>
                        {activeUrgency.label}
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showUrgency ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                    </button>
                    {showUrgency && (
                        <>
                            <div onClick={() => setShowUrgency(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                                background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)',
                                boxShadow: '0 16px 48px rgba(0,0,0,0.12)', width: 200, overflow: 'hidden',
                                animation: 'fadeIn 0.15s ease', padding: 8,
                            }}>
                                {URGENCY_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => { onUrgencyChange(opt.value); setShowUrgency(false); }} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10,
                                        border: 'none', background: urgencyFilter === opt.value ? 'linear-gradient(135deg,var(--primary),#ff4db1)' : 'transparent',
                                        color: urgencyFilter === opt.value ? '#fff' : 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem',
                                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'left' as const,
                                    }}
                                    onMouseEnter={e => { if (urgencyFilter !== opt.value) (e.currentTarget).style.background = 'var(--bg)'; }}
                                    onMouseLeave={e => { if (urgencyFilter !== opt.value) (e.currentTarget).style.background = 'transparent'; }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: urgencyFilter === opt.value ? '#fff' : (opt.color || 'var(--text-muted)') }}>{opt.icon}</span>
                                        {opt.label}
                                        {urgencyFilter === opt.value && <span className="material-symbols-outlined" style={{ fontSize: 14, marginLeft: 'auto' }}>check</span>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
