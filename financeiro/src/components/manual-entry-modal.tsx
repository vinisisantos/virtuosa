'use client';

import { useState, useEffect } from 'react';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { formatCurrency, parseCur } from '@/hooks/useDashboard';

interface ManualEntryModalProps {
    onSave: (data: { employeeName: string; netSalary: number; baseSalary?: number; cargo?: string; unit: string; notes?: string; hasAdiantamento?: boolean; isRecurring?: boolean; hasFgts?: boolean }) => void;
    onClose: () => void;
}

export function ManualEntryModal({ onSave, onClose }: ManualEntryModalProps) {
    const { globalUnit } = useGlobalUnit();
    const [name, setName] = useState('');
    const [salaryStr, setSalaryStr] = useState('');
    const [baseSalaryStr, setBaseSalaryStr] = useState('');
    const [cargo, setCargo] = useState('');
    const [notes, setNotes] = useState('');
    const [hasAdiantamento, setHasAdiantamento] = useState(false);
    const [isRecurring, setIsRecurring] = useState(false);
    const [hasFgts, setHasFgts] = useState(true);
    const [showAdvanced, setShowAdvanced] = useState(false);
    
    const [cargoSuggestions, setCargoSuggestions] = useState<string[]>([]);

    useEffect(() => {
        // Fetch known cargos from DB
        fetch('/api/payroll/cargos')
            .then(r => r.json())
            .then(data => {
                if (data.success && data.cargos) {
                    setCargoSuggestions(data.cargos);
                }
            })
            .catch(() => {});
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const netSalary = parseCur(salaryStr);
        if (!name || netSalary <= 0) return;
        
        onSave({
            employeeName: name,
            netSalary,
            baseSalary: baseSalaryStr ? parseCur(baseSalaryStr) : undefined,
            cargo: cargo || undefined,
            unit: globalUnit,
            notes: notes || undefined,
            hasAdiantamento,
            isRecurring,
            hasFgts,
        });
    };

    const modalBg = { position: 'fixed' as const, inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: 20 };
    const inputStyle = {
        width: '100%', padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '2px solid var(--border)',
        background: 'var(--bg)', fontWeight: 600,
        fontFamily: 'inherit', fontSize: '0.9rem',
        transition: 'var(--transition)', outline: 'none',
        boxSizing: 'border-box' as const,
    };

    const toggleStyle = (on: boolean): React.CSSProperties => ({
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: on ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--border)',
        position: 'relative', transition: 'background 0.3s', flexShrink: 0,
    });

    const toggleKnob = (on: boolean): React.CSSProperties => ({
        width: 16, height: 16, borderRadius: 8, background: '#fff',
        position: 'absolute', top: 3, left: on ? 21 : 3,
        transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    });

    return (
        <div style={modalBg} onClick={onClose}>
            <div style={{
                background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)', maxWidth: 520, width: '100%', padding: 28,
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'var(--primary-light)', color: 'var(--primary)',
                        }}>
                            <span className="material-symbols-outlined">person_add</span>
                        </div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Adicionar Colaborador</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Nome */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Nome do Colaborador
                        </label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)}
                            placeholder="Ex: João Silva" required style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    {/* Salário Líquido + Cargo */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                Salário Líquido (R$)
                            </label>
                            <input type="text" inputMode="numeric" value={salaryStr}
                                onChange={e => setSalaryStr(formatCurrency(e.target.value))}
                                placeholder="0,00" required style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                                onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                Cargo
                            </label>
                            <input type="text" value={cargo} onChange={e => setCargo(e.target.value)}
                                list="cargo-suggestions"
                                placeholder="Ex: Vendedor" style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                                onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                            />
                            <datalist id="cargo-suggestions">
                                {cargoSuggestions.map((c, i) => <option key={i} value={c} />)}
                            </datalist>
                        </div>
                    </div>

                    {/* Salário Base */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Salário Base (R$) <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>Opcional</span>
                        </label>
                        <input type="text" inputMode="numeric" value={baseSalaryStr}
                            onChange={e => setBaseSalaryStr(formatCurrency(e.target.value))}
                            placeholder="0,00" style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    {/* Observações */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Observações (opcional)
                        </label>
                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Notas adicionais..." style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    {/* Toggles Section — Adiantamento, Fixo, FGTS */}
                    <div style={{
                        marginBottom: 20, padding: 16, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg)', border: '1px solid var(--border)',
                    }}>
                        <div
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                cursor: 'pointer', userSelect: 'none',
                            }}
                        >
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>tune</span>
                                Opções Avançadas
                            </span>
                            <span className="material-symbols-outlined" style={{
                                fontSize: 18, color: 'var(--text-muted)',
                                transition: 'transform 0.3s',
                                transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}>expand_more</span>
                        </div>

                        <div style={{
                            maxHeight: showAdvanced ? 260 : 0,
                            opacity: showAdvanced ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.3s ease, opacity 0.2s ease',
                        }}>
                            <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                
                                {/* FGTS toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button type="button" onClick={() => setHasFgts(!hasFgts)} style={toggleStyle(hasFgts)}>
                                        <div style={toggleKnob(hasFgts)} />
                                    </button>
                                    <div onClick={() => setHasFgts(!hasFgts)} style={{ cursor: 'pointer' }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: hasFgts ? '#0ea5e9' : 'var(--text-main)' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'text-bottom', marginRight: 4 }}>savings</span>
                                            Calcular FGTS (8%)
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                            {hasFgts ? 'FGTS será calculado na folha' : 'Cálculo de FGTS desativado'}
                                        </div>
                                    </div>
                                </div>

                                {/* Adiantamento toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button type="button" onClick={() => setHasAdiantamento(!hasAdiantamento)} style={toggleStyle(hasAdiantamento)}>
                                        <div style={toggleKnob(hasAdiantamento)} />
                                    </button>
                                    <div onClick={() => setHasAdiantamento(!hasAdiantamento)} style={{ cursor: 'pointer' }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: hasAdiantamento ? '#f59e0b' : 'var(--text-main)' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'text-bottom', marginRight: 4 }}>account_balance_wallet</span>
                                            Adiantamento
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                            {hasAdiantamento ? 'Adiantamento de 40% ativo' : 'Sem adiantamento'}
                                        </div>
                                    </div>
                                </div>

                                {/* Fixo mensal toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button type="button" onClick={() => setIsRecurring(!isRecurring)} style={toggleStyle(isRecurring)}>
                                        <div style={toggleKnob(isRecurring)} />
                                    </button>
                                    <div onClick={() => setIsRecurring(!isRecurring)} style={{ cursor: 'pointer' }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isRecurring ? '#6366f1' : 'var(--text-main)' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'text-bottom', marginRight: 4 }}>repeat</span>
                                            Fixo Mensal
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                            {isRecurring ? 'Será repetido nos próximos meses' : 'Apenas este mês'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button type="button" onClick={onClose} style={{
                            flex: 1, padding: '12px 20px', border: '2px solid var(--border)',
                            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
                            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                            color: 'var(--text-muted)', cursor: 'pointer',
                        }}>Cancelar</button>
                        <button type="submit" disabled={!name || parseCur(salaryStr) <= 0} style={{
                            flex: 1, padding: '12px 20px', border: 'none',
                            borderRadius: 'var(--radius-md)',
                            background: (!name || parseCur(salaryStr) <= 0) ? 'var(--border)' : 'var(--primary)',
                            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                            color: (!name || parseCur(salaryStr) <= 0) ? 'var(--text-muted)' : 'white',
                            cursor: (!name || parseCur(salaryStr) <= 0) ? 'not-allowed' : 'pointer',
                            boxShadow: (!name || parseCur(salaryStr) <= 0) ? 'none' : '0 4px 12px rgba(230, 0, 126, 0.25)',
                        }}>Adicionar</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
