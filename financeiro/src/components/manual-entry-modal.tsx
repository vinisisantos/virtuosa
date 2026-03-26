'use client';

import { useState } from 'react';

interface ManualEntryModalProps {
    onSave: (data: { employeeName: string; netSalary: number; unit: string; notes?: string }) => void;
    onClose: () => void;
}

export function ManualEntryModal({ onSave, onClose }: ManualEntryModalProps) {
    const [name, setName] = useState('');
    const [salary, setSalary] = useState('');
    const [unit, setUnit] = useState('Barueri');
    const [notes, setNotes] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !salary) return;
        onSave({ employeeName: name, netSalary: parseFloat(salary), unit, notes: notes || undefined });
    };

    const modalBg = { position: 'fixed' as const, inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: 20 };
    const inputStyle = {
        width: '100%', padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '2px solid var(--border)',
        background: 'var(--bg)', fontWeight: 600,
        fontFamily: 'inherit', fontSize: '0.9rem',
        transition: 'var(--transition)', outline: 'none',
    };

    return (
        <div style={modalBg} onClick={onClose}>
            <div style={{
                background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)', maxWidth: 460, width: '100%', padding: 28,
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

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Salário Líquido (R$)
                        </label>
                        <input type="number" step="0.01" min="0" value={salary}
                            onChange={e => setSalary(e.target.value)}
                            placeholder="Ex: 2350.00" required style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Unidade
                        </label>
                        <select value={unit} onChange={e => setUnit(e.target.value)} style={inputStyle}>
                            <option value="Barueri">Barueri</option>
                            <option value="SCS">SCS</option>
                            <option value="SBC">SBC</option>
                            <option value="Osasco">Osasco</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Observações (opcional)
                        </label>
                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Notas adicionais..." style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button type="button" onClick={onClose} style={{
                            flex: 1, padding: '12px 20px', border: '2px solid var(--border)',
                            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
                            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                            color: 'var(--text-muted)', cursor: 'pointer',
                        }}>Cancelar</button>
                        <button type="submit" disabled={!name || !salary} style={{
                            flex: 1, padding: '12px 20px', border: 'none',
                            borderRadius: 'var(--radius-md)',
                            background: (!name || !salary) ? 'var(--border)' : 'var(--primary)',
                            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                            color: (!name || !salary) ? 'var(--text-muted)' : 'white',
                            cursor: (!name || !salary) ? 'not-allowed' : 'pointer',
                            boxShadow: (!name || !salary) ? 'none' : '0 4px 12px rgba(230, 0, 126, 0.25)',
                        }}>Adicionar</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
