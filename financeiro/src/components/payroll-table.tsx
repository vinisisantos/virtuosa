'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PayrollEntryData, PaymentStatus } from '@/lib/types';

type SortKey = 'name' | 'salary' | 'status' | null;
type SortDir = 'asc' | 'desc';

interface PayrollTableProps {
    entries: PayrollEntryData[];
    loading: boolean;
    onTogglePayment: (id: string, currentStatus: PaymentStatus) => void;
    onTogglePenalty: (id: string, currentPenalty: boolean) => void;
    onToggleAdiantamento: (id: string, currentValue: boolean) => void;
    onToggleRecurring: (id: string, currentValue: boolean) => void;
    onDelete: (id: string) => void;
    onEdit: (id: string, data: { employeeName?: string; netSalary?: number; baseSalary?: number | null; cargo?: string | null; bonus?: number | null; notes?: string }) => void;
    competenceLabel: string;
    searchQuery?: string;
    bonusMap?: Record<string, number>;
    adiantamentoMap?: Record<string, number>;
}

function HighlightText({ text, query }: { text: string; query?: string }) {
    if (!query || !query.trim()) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark style={{ background: 'rgba(245,158,11,0.3)', borderRadius: 3, padding: '0 2px', color: 'inherit' }}>
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </>
    );
}

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Format a number into Brazilian display for inputs: 1250.5 -> "1.250,50"
function formatInputBRL(value: number): string {
    if (value === 0) return '0,00';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Parse a Brazilian formatted string back to a number: "1.250,50" -> 1250.5
function parseInputBRL(str: string): number {
    if (!str || str.trim() === '') return 0;
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
}

// Handle input change: allow only digits, commas, dots
function handleBRLInput(raw: string, setter: (v: string) => void) {
    // Strip everything except digits, comma, dot
    const cleaned = raw.replace(/[^\d.,]/g, '');
    setter(cleaned);
}

export function PayrollTable({ entries, loading, onTogglePayment, onTogglePenalty, onToggleAdiantamento, onToggleRecurring, onDelete, onEdit, competenceLabel, searchQuery, bonusMap = {}, adiantamentoMap = {} }: PayrollTableProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editSalary, setEditSalary] = useState('');
    const [editBaseSalary, setEditBaseSalary] = useState('');
    const [editCargo, setEditCargo] = useState('');
    const [editBonus, setEditBonus] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('virtuosa_payroll_collapsed') === 'true';
        }
        return false;
    });
    const [penaltyPercent, setPenaltyPercent] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('virtuosa_penalty_percent');
            return stored ? parseInt(stored) : 10;
        }
        return 10;
    });
    const penaltyRate = penaltyPercent / 100;
    const [sortKey, setSortKey] = useState<SortKey>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === entries.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(entries.map(e => e.id)));
        }
    };

    const selectedEntries = entries.filter(e => selectedIds.has(e.id));
    const selectionTotal = selectedEntries.reduce((s, e) => {
        const k = e.employeeName.toLowerCase().trim();
        const base = e.hasPenalty ? e.netSalary * (1 + penaltyRate) : e.netSalary;
        const autoAdiant = e.hasAdiantamento ? e.netSalary * 0.5 : 0;
        return s + base + (e.bonus || 0) - autoAdiant - (adiantamentoMap[k] || 0);
    }, 0);
    const selectionBonus = selectedEntries.reduce((s, e) => s + (e.bonus || 0), 0);
    const selectionAdiant = selectedEntries.reduce((s, e) => {
        const k = e.employeeName.toLowerCase().trim();
        const autoAdiant = e.hasAdiantamento ? e.netSalary * 0.5 : 0;
        return s + autoAdiant + (adiantamentoMap[k] || 0);
    }, 0);
    const selectionBruto = selectedEntries.reduce((s, e) => s + (e.hasPenalty ? e.netSalary * (1 + penaltyRate) : e.netSalary), 0);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const sortedEntries = useMemo(() => {
        if (!sortKey) return entries;
        return [...entries].sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'name') cmp = a.employeeName.localeCompare(b.employeeName, 'pt-BR');
            else if (sortKey === 'salary') cmp = a.netSalary - b.netSalary;
            else if (sortKey === 'status') cmp = a.paymentStatus.localeCompare(b.paymentStatus);
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [entries, sortKey, sortDir]);

    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        setIsMobile(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('virtuosa_payroll_collapsed', String(next));
            return next;
        });
    };

    const startEdit = (entry: PayrollEntryData) => {
        setEditingId(entry.id); setEditName(entry.employeeName);
        setEditSalary(formatInputBRL(entry.netSalary));
        setEditBaseSalary(entry.baseSalary != null && entry.baseSalary > 0 ? formatInputBRL(entry.baseSalary) : '');
        setEditCargo(entry.cargo || '');
        setEditBonus(entry.bonus != null && entry.bonus > 0 ? formatInputBRL(entry.bonus) : '');
        setEditNotes(entry.notes || '');
    };
    const saveEdit = () => {
        if (!editingId) return;
        onEdit(editingId, {
            employeeName: editName,
            netSalary: parseInputBRL(editSalary),
            baseSalary: editBaseSalary ? parseInputBRL(editBaseSalary) : null,
            cargo: editCargo || null,
            bonus: editBonus ? parseInputBRL(editBonus) : 0,
            notes: editNotes || undefined,
        });
        setEditingId(null);
    };
    const cancelEdit = () => setEditingId(null);

    const cardStyle = {
        background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)',
        marginBottom: 40, overflow: 'hidden' as const,
    };

    const thStyle = {
        textAlign: 'left' as const, padding: '14px 20px',
        fontSize: '0.8rem', fontWeight: 700,
        color: 'var(--text-muted)', textTransform: 'uppercase' as const,
        letterSpacing: '0.5px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
    };

    const tdStyle = {
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        transition: 'var(--transition)',
    };

    const inputStyle = {
        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
        border: '2px solid var(--primary)', fontFamily: 'inherit',
        fontWeight: 600, fontSize: '0.9rem', outline: 'none',
        background: 'var(--bg)',
    };

    if (loading) {
        const skeletonPulse = `@keyframes skeletonPulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 1 } }`;
        const bar = (w: string | number, h = 14) => ({
            width: typeof w === 'number' ? w : w, height: h, borderRadius: 6,
            background: 'var(--border)', animation: 'skeletonPulse 1.5s ease-in-out infinite',
        });
        return (
            <div style={{ ...cardStyle, padding: 0 }}>
                <style>{skeletonPulse}</style>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={bar(22, 22)} />
                        <div style={bar(120, 16)} />
                    </div>
                    <div style={bar(80, 24)} />
                </div>
                <div style={{ padding: '0 6px' }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border)', animationDelay: `${i * 0.1}s` }}>
                            <div style={bar('40%', 14)} />
                            <div style={bar(60, 20)} />
                            <div style={{ ...bar(80, 12), marginLeft: 'auto' }} />
                            <div style={bar(36, 36)} />
                            <div style={bar(60, 22)} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div style={{ ...cardStyle, padding: '60px 20px', textAlign: 'center' }}>
                <div style={{
                    width: 80, height: 80, borderRadius: 20,
                    background: 'linear-gradient(135deg, var(--primary-light), rgba(230,0,126,0.15))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(230,0,126,0.1)',
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 38, color: 'var(--primary)' }}>upload_file</span>
                </div>
                <h3 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: 8, background: 'linear-gradient(135deg, var(--primary), var(--text-main))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Nenhuma folha importada
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 400, margin: '0 auto 16px', lineHeight: 1.5 }}>
                    Importe um PDF de folha de pagamento para <strong>{competenceLabel}</strong> usando o botão acima.
                </p>
                <span className="material-symbols-outlined" style={{
                    fontSize: 28, color: 'var(--primary)', opacity: 0.5,
                    animation: 'bounceUp 1.5s ease-in-out infinite',
                }}>arrow_upward</span>
                <style>{`@keyframes bounceUp { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }`}</style>
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            {/* Section header — clickable to collapse/expand */}
            <div
                onClick={() => toggleCollapsed()}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 20px', borderBottom: collapsed ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s',
                }}
            >
                <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>groups</span>
                    Colaboradores
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                        fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)',
                        background: 'var(--primary-light)', padding: '4px 12px',
                        borderRadius: 'var(--radius-full)',
                    }}>
                        {entries.length} {entries.length === 1 ? 'registro' : 'registros'}
                    </span>
                    <span className="material-symbols-outlined" style={{
                        fontSize: 22, color: 'var(--text-muted)',
                        transition: 'transform 0.3s ease',
                        transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                    }}>expand_more</span>
                </div>
            </div>

            <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', maxHeight: collapsed ? 0 : 4000, opacity: collapsed ? 0 : 1, transition: 'max-height 0.4s ease, opacity 0.3s ease' }}>
                {/* Progress Bar */}
                {(() => {
                    const paidCount = entries.filter(e => e.paymentStatus === 'paid').length;
                    const total = entries.length;
                    const perc = total > 0 ? Math.round((paidCount / total) * 100) : 0;
                    const allPaid = paidCount === total;
                    return (
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                        {allPaid ? '✅ Todos pagos' : `${paidCount} de ${total} pagos`}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: allPaid ? 'var(--success)' : 'var(--text-muted)' }}>
                                        {perc}%
                                    </span>
                                </div>
                                <div style={{ width: '100%', height: 8, borderRadius: 10, background: 'var(--border)', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${perc}%`, height: '100%', borderRadius: 10,
                                        background: allPaid ? 'var(--success)' : 'linear-gradient(90deg, var(--primary), #f59e0b)',
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>
                        </div>
                    );
                })()}
                {/* Mobile Card View */}
                {isMobile && (
                    <div style={{ padding: '8px 12px' }}>
                        {sortedEntries.map(entry => {
                            const key = entry.employeeName.toLowerCase().trim();
                            const dbBonus = entry.bonus || 0;
                            const autoAdiant = entry.hasAdiantamento ? entry.netSalary * 0.5 : 0;
                            const manualAdiant = adiantamentoMap[key] || 0;
                            const adiant = autoAdiant + manualAdiant;
                            const base = entry.hasPenalty ? entry.netSalary * (1 + penaltyRate) : entry.netSalary;
                            const liquido = base + dbBonus - adiant;
                            const isSelected = selectedIds.has(entry.id);
                            return (
                                <div key={entry.id} style={{
                                    background: isSelected ? 'rgba(99,102,241,0.06)' : entry.paymentStatus === 'paid' ? 'var(--success-light)' : 'var(--bg)',
                                    borderRadius: 14, marginBottom: 10, padding: '14px 16px',
                                    border: isSelected ? '1.5px solid #6366f1' : '1px solid var(--border)',
                                    borderLeft: `4px solid ${isSelected ? '#6366f1' : entry.paymentStatus === 'paid' ? 'var(--success)' : entry.paymentStatus === 'review' ? 'var(--warning)' : 'var(--border)'}`,
                                    transition: 'all 0.15s',
                                }}>
                                    {/* Top: Checkbox + Name + Status */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
                                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(entry.id)}
                                                style={{ width: 16, height: 16, marginTop: 2, accentColor: '#6366f1', cursor: 'pointer', flexShrink: 0 }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 4 }}>
                                                    <HighlightText text={entry.employeeName} query={searchQuery} />
                                                </div>
                                                {entry.cargo && (
                                                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
                                                        {entry.cargo}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <StatusBadge status={entry.paymentStatus as PaymentStatus} paymentDate={entry.paymentDate} />
                                    </div>

                                    {/* Values grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 10, fontSize: '0.8rem' }}>
                                        {entry.baseSalary != null && entry.baseSalary > 0 && (
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 2 }}>Sal. Base</div>
                                                <div style={{ fontWeight: 700, color: '#6366f1' }}>{formatBRL(entry.baseSalary)}</div>
                                            </div>
                                        )}
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 2 }}>Salário</div>
                                            <div style={{ fontWeight: 800 }}>{formatBRL(entry.netSalary)}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 2 }}>Total</div>
                                            <div style={{ fontWeight: 800, color: entry.hasPenalty ? 'var(--danger)' : 'inherit' }}>{formatBRL(base)}</div>
                                        </div>
                                        {dbBonus > 0 && (
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 2 }}>Premiação</div>
                                                <div style={{ fontWeight: 700, color: '#f59e0b' }}>+{formatBRL(dbBonus)}</div>
                                            </div>
                                        )}
                                        {adiant > 0 && (
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 2 }}>Adiant.</div>
                                                <div style={{ fontWeight: 700, color: '#ef4444' }}>−{formatBRL(adiant)}</div>
                                            </div>
                                        )}
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 2 }}>Líquido</div>
                                            <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--primary)' }}>{formatBRL(liquido)}</div>
                                        </div>
                                    </div>

                                    {/* Bottom: Actions */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                {/* Multa toggle */}
                                                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 5 }}>
                                                    <input type="checkbox" checked={entry.hasPenalty} onChange={() => onTogglePenalty(entry.id, entry.hasPenalty)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                                                    <span style={{ display: 'block', width: 32, height: 18, background: entry.hasPenalty ? 'var(--danger)' : 'var(--border)', borderRadius: 20, position: 'relative', transition: '0.3s' }}>
                                                        <span style={{ display: 'block', width: 14, height: 14, background: 'var(--bg)', borderRadius: '50%', position: 'absolute', top: 2, left: entry.hasPenalty ? 16 : 2, transition: '0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: entry.hasPenalty ? 'var(--danger)' : 'var(--text-muted)' }}>Multa</span>
                                                </label>
                                                {/* Adiantamento toggle */}
                                                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 5 }}>
                                                    <input type="checkbox" checked={entry.hasAdiantamento} onChange={() => onToggleAdiantamento(entry.id, entry.hasAdiantamento)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                                                    <span style={{ display: 'block', width: 32, height: 18, background: entry.hasAdiantamento ? '#f59e0b' : 'var(--border)', borderRadius: 20, position: 'relative', transition: '0.3s' }}>
                                                        <span style={{ display: 'block', width: 14, height: 14, background: 'var(--bg)', borderRadius: '50%', position: 'absolute', top: 2, left: entry.hasAdiantamento ? 16 : 2, transition: '0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: entry.hasAdiantamento ? '#f59e0b' : 'var(--text-muted)' }}>Adiant.</span>
                                                </label>
                                                {/* Recurring toggle */}
                                                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 5 }}>
                                                    <input type="checkbox" checked={entry.isRecurring} onChange={() => onToggleRecurring(entry.id, entry.isRecurring)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                                                    <span style={{ display: 'block', width: 32, height: 18, background: entry.isRecurring ? '#6366f1' : 'var(--border)', borderRadius: 20, position: 'relative', transition: '0.3s' }}>
                                                        <span style={{ display: 'block', width: 14, height: 14, background: 'var(--bg)', borderRadius: '50%', position: 'absolute', top: 2, left: entry.isRecurring ? 16 : 2, transition: '0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: entry.isRecurring ? '#6366f1' : 'var(--text-muted)' }}>Fixo</span>
                                                </label>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button onClick={(e) => {
                                                    const btn = e.currentTarget;
                                                    btn.style.transform = 'scale(1.3)';
                                                    setTimeout(() => { btn.style.transform = 'scale(1)'; }, 200);
                                                    onTogglePayment(entry.id, entry.paymentStatus as PaymentStatus);
                                                }} style={{
                                                    width: 34, height: 34, borderRadius: 8,
                                                    border: 'none', cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                    ...(entry.paymentStatus === 'paid'
                                                        ? { background: 'var(--success-light)', color: 'var(--success)' }
                                                        : { background: 'var(--border)', color: 'var(--text-muted)' }),
                                                }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                                        {entry.paymentStatus === 'paid' ? 'check_circle' : 'radio_button_unchecked'}
                                                    </span>
                                                </button>
                                                <IconBtn icon="delete" color="var(--danger)" bg="transparent" onClick={() => onDelete(entry.id)} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Mobile selection summary */}
                        {selectedIds.size > 0 && (
                            <div style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                borderRadius: 14, padding: '12px 16px',
                                marginBottom: 10, color: '#fff',
                            }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.85, marginBottom: 6 }}>
                                    ✓ {selectedIds.size} colaborador{selectedIds.size !== 1 ? 'es' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.8rem' }}>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Bruto</div>
                                        <div style={{ fontWeight: 900, fontSize: '1rem' }}>{formatBRL(selectionBruto)}</div>
                                    </div>
                                    {selectionBonus > 0 && <div>
                                        <div style={{ opacity: 0.75, fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Premiação</div>
                                        <div style={{ fontWeight: 800, color: '#fde68a' }}>+{formatBRL(selectionBonus)}</div>
                                    </div>}
                                    {selectionAdiant > 0 && <div>
                                        <div style={{ opacity: 0.75, fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Adiantamento</div>
                                        <div style={{ fontWeight: 800, color: '#fca5a5' }}>−{formatBRL(selectionAdiant)}</div>
                                    </div>}
                                    <div style={{ gridColumn: selectionBonus > 0 || selectionAdiant > 0 ? '1 / -1' : 'auto', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6, marginTop: 2 }}>
                                        <div style={{ opacity: 0.75, fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Total Líquido</div>
                                        <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>{formatBRL(selectionTotal)}</div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedIds(new Set())} style={{
                                    marginTop: 8, background: 'rgba(255,255,255,0.15)', border: 'none',
                                    borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: '0.7rem',
                                    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                }}>Limpar seleção</button>
                            </div>
                        )}
                        {/* Mobile totals bar */}
                        {entries.length > 0 && (
                            <div style={{
                                background: 'var(--card-bg)', borderRadius: 14,
                                padding: '12px 16px', border: '1px solid var(--border)',
                                borderTop: '3px solid var(--primary)',
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem' }}>
                                    {(() => {
                                        const totalBase = entries.reduce((s, e) => s + (e.baseSalary || 0), 0);
                                        return totalBase > 0 ? (
                                            <div>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sal. Base</div>
                                                <div style={{ fontWeight: 900, color: '#6366f1' }}>{formatBRL(totalBase)}</div>
                                            </div>
                                        ) : null;
                                    })()}
                                    <div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Folha</div>
                                        <div style={{ fontWeight: 900, color: 'var(--primary)' }}>{formatBRL(entries.reduce((s, e) => s + e.netSalary, 0))}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Líquido</div>
                                        <div style={{ fontWeight: 900, color: 'var(--primary)' }}>
                                            {formatBRL(entries.reduce((s, e) => {
                                                const k = e.employeeName.toLowerCase().trim();
                                                const autoAdiant = e.hasAdiantamento ? e.netSalary * 0.5 : 0;
                                                return s + (e.hasPenalty ? e.netSalary * (1 + penaltyRate) : e.netSalary) + (e.bonus || 0) - autoAdiant - (adiantamentoMap[k] || 0);
                                            }, 0))}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                            {entries.filter(e => e.paymentStatus === 'paid').length} pagos
                                        </span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                                            {entries.filter(e => e.paymentStatus !== 'paid').length} pend.
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <table style={{ width: '100%', minWidth: 1400, borderCollapse: 'collapse', display: isMobile ? 'none' : 'table' }}>
                    <thead>
                        <tr>
                            <th style={{ ...thStyle, textAlign: 'center', width: 48 }}>
                                <input type="checkbox"
                                    checked={entries.length > 0 && selectedIds.size === entries.length}
                                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < entries.length; }}
                                    onChange={toggleSelectAll}
                                    style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer' }}
                                    title="Selecionar todos"
                                />
                            </th>
                            <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    Colaborador
                                    {sortKey === 'name' && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
                                </span>
                            </th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Cargo</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Sal. Base</th>
                            <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('salary')}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', width: '100%' }}>
                                    Valor Original
                                    {sortKey === 'salary' && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
                                </span>
                            </th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                    Multa
                                    <select value={penaltyPercent} onChange={e => {
                                        const v = parseInt(e.target.value);
                                        setPenaltyPercent(v);
                                        localStorage.setItem('virtuosa_penalty_percent', String(v));
                                    }} onClick={e => e.stopPropagation()} style={{
                                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                                        padding: '1px 4px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--danger)',
                                        cursor: 'pointer', fontFamily: 'inherit',
                                    }}>
                                        {[5, 10, 15, 20].map(p => <option key={p} value={p}>{p}%</option>)}
                                    </select>
                                </div>
                            </th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Premiação</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Adiant.</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Líquido</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Fixo</th>
                            <th style={{ ...thStyle, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    Status
                                    {sortKey === 'status' && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
                                </span>
                            </th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Pagamento</th>
                            <th style={thStyle}>Obs</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedEntries.map((entry) => {
                            const isSelected = selectedIds.has(entry.id);
                            return (
                            <tr key={entry.id} style={{
                                ...(isSelected ? { background: 'rgba(99,102,241,0.06)' } : entry.paymentStatus === 'paid' ? { background: 'var(--success-light)' } : {}),
                                outline: isSelected ? '1.5px solid rgba(99,102,241,0.3)' : 'none',
                                outlineOffset: '-1px',
                            }}
                                onMouseEnter={e => { if (entry.paymentStatus !== 'paid' && !isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--primary-light)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(99,102,241,0.06)' : entry.paymentStatus === 'paid' ? 'var(--success-light)' : ''; }}
                            >
                                {/* Checkbox cell */}
                                <td style={{ ...tdStyle, textAlign: 'center', width: 48 }}>
                                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(entry.id)}
                                        style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer' }} />
                                </td>
                                <td style={tdStyle}>
                                    {editingId === entry.id ? (
                                        <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                                    ) : (
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}><HighlightText text={entry.employeeName} query={searchQuery} /></span>
                                                {entry.confidenceScore < 0.6 && (
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--warning)' }} title="Baixa confiança — necessita revisão">warning</span>
                                                )}
                                            </div>
                                            {entry.confidenceScore > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                                                    title={`Confiança da extração: ${Math.round(entry.confidenceScore * 100)}%`}>
                                                    <div style={{ width: 48, height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                                                        <div style={{
                                                            width: `${entry.confidenceScore * 100}%`, height: '100%', borderRadius: 4,
                                                            background: entry.confidenceScore >= 0.8 ? '#10b981'
                                                                : entry.confidenceScore >= 0.6 ? '#f59e0b' : '#ef4444',
                                                            transition: 'width 0.3s',
                                                        }} />
                                                    </div>
                                                    <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                        {Math.round(entry.confidenceScore * 100)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    {editingId === entry.id ? (
                                        <input value={editCargo} onChange={e => setEditCargo(e.target.value)} placeholder="Cargo" style={{ ...inputStyle, width: 120, textAlign: 'center' }} />
                                    ) : (
                                        entry.cargo ? (
                                            <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
                                                {entry.cargo}
                                            </span>
                                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                    {editingId === entry.id ? (
                                        <input type="text" inputMode="decimal" value={editBaseSalary} onChange={e => handleBRLInput(e.target.value, setEditBaseSalary)} placeholder="0,00" style={{ ...inputStyle, width: 110, textAlign: 'right' }} />
                                    ) : (
                                        entry.baseSalary != null && entry.baseSalary > 0 ? (
                                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#6366f1' }}>{formatBRL(entry.baseSalary)}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                        )
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                    {editingId === entry.id ? (
                                        <input type="text" inputMode="decimal" value={editSalary} onChange={e => handleBRLInput(e.target.value, setEditSalary)} style={{ ...inputStyle, width: 110, textAlign: 'right' }} />
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{formatBRL(entry.netSalary)}</span>
                                            {(() => {
                                                const sortedSals = [...entries.map(e => e.netSalary)].sort((a, b) => a - b);
                                                const mid = Math.floor(sortedSals.length / 2);
                                                const med = sortedSals.length > 2 ? (sortedSals.length % 2 === 0 ? (sortedSals[mid - 1] + sortedSals[mid]) / 2 : sortedSals[mid]) : 0;
                                                if (med === 0 || entries.length <= 2) return null;
                                                const dev = Math.abs(entry.netSalary - med) / med;
                                                if (dev < 0.5) return null;
                                                const devPct = Math.round(dev * 100);
                                                return (
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--warning)', cursor: 'help' }}
                                                        title={`Valor ${devPct}% ${entry.netSalary > med ? 'acima' : 'abaixo'} da mediana (${formatBRL(med)}). Verifique se houve erro na extração.`}>
                                                        warning
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                                            <input
                                                type="checkbox"
                                                checked={entry.hasPenalty}
                                                onChange={() => onTogglePenalty(entry.id, entry.hasPenalty)}
                                                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                                            />
                                            <span style={{
                                                display: 'block', width: 36, height: 20,
                                                background: entry.hasPenalty ? 'var(--danger)' : 'var(--border)',
                                                borderRadius: 20, position: 'relative', transition: '0.3s'
                                            }}>
                                                <span style={{
                                                    display: 'block', width: 16, height: 16, background: 'var(--bg)',
                                                    borderRadius: '50%', position: 'absolute', top: 2,
                                                    left: entry.hasPenalty ? 18 : 2, transition: '0.3s',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                                }}></span>
                                            </span>
                                        </label>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: entry.hasPenalty ? 'var(--danger)' : 'var(--text-muted)' }}>
                                            {entry.hasPenalty ? `+${formatBRL(entry.netSalary * penaltyRate)}` : 'S/ Multa'}
                                        </span>
                                    </div>
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: entry.hasPenalty ? 'var(--danger)' : 'inherit' }}>
                                        {formatBRL(entry.hasPenalty ? entry.netSalary * (1 + penaltyRate) : entry.netSalary)}
                                    </span>
                                </td>
                                {(() => {
                                    const key = entry.employeeName.toLowerCase().trim();
                                    const dbBonus = entry.bonus || 0;
                                    const autoAdiant = entry.hasAdiantamento ? entry.netSalary * 0.5 : 0;
                                    const manualAdiant = adiantamentoMap[key] || 0;
                                    const totalAdiant = autoAdiant + manualAdiant;
                                    const base = entry.hasPenalty ? entry.netSalary * (1 + penaltyRate) : entry.netSalary;
                                    const liquido = base + dbBonus - totalAdiant;
                                    return (
                                        <>
                                            {/* Premiação */}
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                {editingId === entry.id ? (
                                                    <input type="text" inputMode="decimal" value={editBonus} onChange={e => handleBRLInput(e.target.value, setEditBonus)} placeholder="0,00" style={{ ...inputStyle, width: 100, textAlign: 'right' }} />
                                                ) : dbBonus > 0 ? (
                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b' }}>
                                                        +{formatBRL(dbBonus)}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                                )}
                                            </td>
                                            {/* Adiantamento — toggle + valor */}
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                                                        <input type="checkbox" checked={entry.hasAdiantamento} onChange={() => onToggleAdiantamento(entry.id, entry.hasAdiantamento)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                                                        <span style={{
                                                            display: 'block', width: 36, height: 20,
                                                            background: entry.hasAdiantamento ? '#f59e0b' : 'var(--border)',
                                                            borderRadius: 20, position: 'relative', transition: '0.3s',
                                                        }}>
                                                            <span style={{
                                                                display: 'block', width: 16, height: 16, background: 'var(--bg)',
                                                                borderRadius: '50%', position: 'absolute', top: 2,
                                                                left: entry.hasAdiantamento ? 18 : 2, transition: '0.3s',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                                            }} />
                                                        </span>
                                                    </label>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: totalAdiant > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                                                        {totalAdiant > 0 ? `−${formatBRL(totalAdiant)}` : 'S/ Adiant.'}
                                                    </span>
                                                </div>
                                            </td>
                                            {/* Líquido */}
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                <span style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--primary)' }}>
                                                    {formatBRL(liquido)}
                                                </span>
                                            </td>
                                            {/* Fixo/Recorrente */}
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }} title={entry.isRecurring ? 'Salário fixo — será repetido automaticamente nos próximos meses' : 'Clique para fixar este salário nos próximos meses'}>
                                                        <input type="checkbox" checked={entry.isRecurring} onChange={() => onToggleRecurring(entry.id, entry.isRecurring)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                                                        <span style={{
                                                            display: 'block', width: 36, height: 20,
                                                            background: entry.isRecurring ? '#6366f1' : 'var(--border)',
                                                            borderRadius: 20, position: 'relative', transition: '0.3s',
                                                        }}>
                                                            <span style={{
                                                                display: 'block', width: 16, height: 16, background: 'var(--bg)',
                                                                borderRadius: '50%', position: 'absolute', top: 2,
                                                                left: entry.isRecurring ? 18 : 2, transition: '0.3s',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                                            }} />
                                                        </span>
                                                    </label>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: entry.isRecurring ? '#6366f1' : 'var(--text-muted)' }}>
                                                        {entry.isRecurring ? '📌 Fixo' : 'Avulso'}
                                                    </span>
                                                </div>
                                            </td>
                                        </>
                                    );
                                })()}
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    <StatusBadge status={entry.paymentStatus as PaymentStatus} paymentDate={entry.paymentDate} />
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <button onClick={(e) => {
                                            const btn = e.currentTarget;
                                            btn.style.transform = 'scale(1.3)';
                                            setTimeout(() => { btn.style.transform = 'scale(0.9)'; }, 120);
                                            setTimeout(() => { btn.style.transform = 'scale(1)'; }, 220);
                                            onTogglePayment(entry.id, entry.paymentStatus as PaymentStatus);
                                        }} style={{
                                            width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                                            border: 'none', cursor: 'pointer', display: 'inline-flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                            ...(entry.paymentStatus === 'paid'
                                                ? { background: 'var(--success-light)', color: 'var(--success)', boxShadow: '0 0 0 3px rgba(16,185,129,0.15)' }
                                                : { background: 'var(--border)', color: 'var(--text-muted)' }),
                                        }}
                                            onMouseEnter={e => { if (entry.paymentStatus !== 'paid') (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                                                {entry.paymentStatus === 'paid' ? 'check_circle' : 'radio_button_unchecked'}
                                            </span>
                                        </button>
                                        {entry.paymentDate && (
                                            <span style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600 }}>
                                                {new Date(entry.paymentDate).toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td style={tdStyle}>
                                    {editingId === entry.id ? (
                                        <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Observações..." style={{ ...inputStyle, width: '100%' }} />
                                    ) : (
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{entry.notes || '—'}</span>
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                        {editingId === entry.id ? (
                                            <>
                                                <IconBtn icon="check" color="var(--success)" bg="var(--success-light)" onClick={saveEdit} />
                                                <IconBtn icon="close" color="var(--text-muted)" bg="var(--border)" onClick={cancelEdit} />
                                            </>
                                        ) : (
                                            <>
                                                <IconBtn icon="edit" color="var(--text-muted)" bg="transparent" onClick={() => startEdit(entry)} />
                                                <IconBtn icon="delete" color="var(--danger)" bg="transparent" onClick={() => onDelete(entry.id)} />
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{
                            position: 'sticky', bottom: 0,
                            background: 'var(--card-bg)',
                            borderTop: '2px solid var(--primary)',
                            boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
                        }}>
                            <td style={{ ...tdStyle, fontWeight: 900, fontSize: '0.85rem' }} colSpan={2}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>functions</span>
                                    TOTAL ({entries.length})
                                </span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '0.88rem', color: '#6366f1' }}>
                                {(() => {
                                    const total = entries.reduce((s, e) => s + (e.baseSalary || 0), 0);
                                    return total > 0 ? formatBRL(total) : '—';
                                })()}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '0.95rem', color: 'var(--primary)' }}>
                                {formatBRL(entries.reduce((s, e) => s + e.netSalary, 0))}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>—</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '0.95rem' }}>
                                {formatBRL(entries.reduce((s, e) => s + e.netSalary * (e.hasPenalty ? (1 + penaltyRate) : 1), 0))}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, fontSize: '0.85rem', color: '#f59e0b' }}>
                                {(() => { const t = entries.reduce((s, e) => s + (e.bonus || 0), 0); return t > 0 ? `+${formatBRL(t)}` : '—'; })()}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', color: '#ef4444' }}>
                                {(() => {
                                    const t = entries.reduce((s, e) => {
                                        const k = e.employeeName.toLowerCase().trim();
                                        const autoAdiant = e.hasAdiantamento ? e.netSalary * 0.5 : 0;
                                        return s + autoAdiant + (adiantamentoMap[k] || 0);
                                    }, 0);
                                    return t > 0 ? `−${formatBRL(t)}` : '—';
                                })()}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '0.95rem', color: 'var(--primary)' }}>
                                {formatBRL(entries.reduce((s, e) => {
                                    const k = e.employeeName.toLowerCase().trim();
                                    const autoAdiant = e.hasAdiantamento ? e.netSalary * 0.5 : 0;
                                    return s + (e.hasPenalty ? e.netSalary * (1 + penaltyRate) : e.netSalary) + (e.bonus || 0) - autoAdiant - (adiantamentoMap[k] || 0);
                                }, 0))}
                            </td>
                            {/* Fixo column — count */}
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                {(() => {
                                    const count = entries.filter(e => e.isRecurring).length;
                                    return count > 0 ? (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                                            {count} fixo{count !== 1 ? 's' : ''}
                                        </span>
                                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>;
                                })()}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                        {entries.filter(e => e.paymentStatus === 'paid').length} pagos
                                    </span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                                        {entries.filter(e => e.paymentStatus !== 'paid').length} pend.
                                    </span>
                                </div>
                            </td>
                            <td colSpan={3} style={tdStyle} />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

function IconBtn({ icon, color, bg, onClick }: { icon: string; color: string; bg: string; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            width: 32, height: 32, borderRadius: 'var(--radius-sm)',
            border: 'none', cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            background: bg, color, transition: 'var(--transition)',
        }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
        </button>
    );
}

function StatusBadge({ status, paymentDate }: { status: PaymentStatus; paymentDate?: string | null }) {
    const config = {
        paid: { label: 'Pago', bg: 'var(--success-light)', color: 'var(--success)', icon: 'check_circle' },
        unpaid: { label: 'Pendente', bg: 'var(--border)', color: 'var(--text-muted)', icon: 'schedule' },
        review: { label: 'Revisão', bg: 'var(--warning-light)', color: 'var(--warning)', icon: 'warning' },
    };
    const c = config[status];
    const tooltip = status === 'paid' && paymentDate
        ? `Pago em ${new Date(paymentDate).toLocaleDateString('pt-BR')}` 
        : status === 'unpaid' ? 'Aguardando pagamento'
        : status === 'review' ? 'Necessita revisão manual' : '';
    return (
        <span title={tooltip} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 12px', borderRadius: 'var(--radius-full)',
            fontSize: '0.8rem', fontWeight: 700, background: c.bg, color: c.color,
            cursor: 'help',
        }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{c.icon}</span>
            {c.label}
        </span>
    );
}
