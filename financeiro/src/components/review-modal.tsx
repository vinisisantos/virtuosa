'use client';

import { useState } from 'react';
import type { ExtractedEmployee } from '@/lib/types';

interface ReviewModalProps {
    employees: ExtractedEmployee[];
    fileName: string;
    competence: string;
    onConfirm: (employees: ExtractedEmployee[]) => void;
    onCancel: () => void;
}

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ReviewModal({ employees: initialEmployees, fileName, competence, onConfirm, onCancel }: ReviewModalProps) {
    const [employees, setEmployees] = useState<ExtractedEmployee[]>(initialEmployees);
    const [confirming, setConfirming] = useState(false);

    const total = employees.reduce((sum, e) => sum + e.netSalary, 0);
    const lowConfidence = employees.filter(e => e.confidenceScore < 0.6).length;

    const updateEmployee = (index: number, field: keyof ExtractedEmployee, value: string | number) => {
        const updated = [...employees];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updated[index] as any)[field] = value;
        setEmployees(updated);
    };

    const removeEmployee = (index: number) => setEmployees(employees.filter((_, i) => i !== index));

    const handleConfirm = async () => { setConfirming(true); await onConfirm(employees); setConfirming(false); };

    const modalBg = { position: 'fixed' as const, inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: 20 };
    const inputStyle = { width: '100%', padding: '6px 10px', border: 'none', borderBottom: '2px solid transparent', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.9rem', background: 'transparent', outline: 'none', transition: 'var(--transition)' };
    const thStyle = { textAlign: 'left' as const, paddingBottom: 10, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

    return (
        <div style={modalBg} onClick={onCancel}>
            <div style={{
                background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)', maxWidth: 700, width: '100%',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Revisão da Importação</h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>description</span>
                            {fileName} • {competence}
                        </p>
                    </div>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Summary badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '12px 24px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Colaboradores: <strong style={{ color: 'var(--text-main)' }}>{employees.length}</strong>
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Total: <strong style={{ color: 'var(--primary)' }}>{formatBRL(total)}</strong>
                    </span>
                    {lowConfidence > 0 && (
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                            {lowConfidence} item(s) baixa confiança
                        </span>
                    )}
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Nome</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Valor Líquido</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Confiança</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map((emp, idx) => (
                                <tr key={idx} style={{
                                    borderBottom: '1px solid var(--border)',
                                    ...(emp.confidenceScore < 0.6 ? { background: 'var(--warning-light)' } : {}),
                                }}>
                                    <td style={{ padding: '10px 0' }}>
                                        <input value={emp.name} onChange={e => updateEmployee(idx, 'name', e.target.value)}
                                            style={inputStyle}
                                            onFocus={e => { e.target.style.borderBottomColor = 'var(--primary)'; }}
                                            onBlur={e => { e.target.style.borderBottomColor = 'transparent'; }}
                                        />
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                        <input type="number" step="0.01" value={emp.netSalary}
                                            onChange={e => updateEmployee(idx, 'netSalary', parseFloat(e.target.value) || 0)}
                                            style={{ ...inputStyle, textAlign: 'right', width: 120 }}
                                            onFocus={e => { e.target.style.borderBottomColor = 'var(--primary)'; }}
                                            onBlur={e => { e.target.style.borderBottomColor = 'transparent'; }}
                                        />
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '3px 10px', borderRadius: 'var(--radius-full)',
                                            fontSize: '0.75rem', fontWeight: 700,
                                            ...(emp.confidenceScore >= 0.8
                                                ? { background: 'var(--success-light)', color: 'var(--success)' }
                                                : emp.confidenceScore >= 0.6
                                                    ? { background: 'var(--warning-light)', color: 'var(--warning)' }
                                                    : { background: 'var(--danger-light)', color: 'var(--danger)' }),
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                                {emp.confidenceScore >= 0.8 ? 'check_circle' : 'warning'}
                                            </span>
                                            {(emp.confidenceScore * 100).toFixed(0)}%
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 0', textAlign: 'right' }}>
                                        <button onClick={() => removeEmployee(idx)} style={{
                                            width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                            border: 'none', cursor: 'pointer', background: 'transparent',
                                            color: 'var(--text-muted)', display: 'inline-flex',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 12, padding: '20px 24px', borderTop: '1px solid var(--border)' }}>
                    <button onClick={onCancel} style={{
                        flex: 1, padding: '12px 20px', border: '2px solid var(--border)',
                        borderRadius: 'var(--radius-md)', background: 'var(--bg)',
                        fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                        color: 'var(--text-muted)', cursor: 'pointer',
                    }}>Cancelar</button>
                    <button onClick={handleConfirm} disabled={employees.length === 0 || confirming} style={{
                        flex: 1, padding: '12px 20px', border: 'none',
                        borderRadius: 'var(--radius-md)', background: 'var(--primary)',
                        fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                        color: 'white', cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(230, 0, 126, 0.25)',
                        opacity: (employees.length === 0 || confirming) ? 0.5 : 1,
                    }}>{confirming ? 'Importando...' : `Confirmar Importação (${employees.length})`}</button>
                </div>
            </div>
        </div>
    );
}
