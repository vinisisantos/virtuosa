'use client';
import { confirmDialog } from '@/components/ui/confirm-dialog';

interface FiltersProps {
    searchQuery: string;
    onSearchChange: (q: string) => void;
    statusFilter: string;
    onStatusFilterChange: (s: string) => void;
    onExportCSV: () => void;
    onAddManual: () => void;
    onPayAll?: () => void;
    hasEntries: boolean;
    hasPending: boolean;
}

const STATUS_OPTIONS = [
    { value: 'all', label: 'Todos', icon: 'list' },
    { value: 'paid', label: 'Pagos', icon: 'check_circle' },
    { value: 'unpaid', label: 'Pendentes', icon: 'schedule' },
    { value: 'review', label: 'Revisão', icon: 'rate_review' },
];

export function Filters({
    searchQuery, onSearchChange,
    statusFilter, onStatusFilterChange,
    onExportCSV, onAddManual, onPayAll,
    hasEntries, hasPending,
}: FiltersProps) {
    return (
        <div style={{
            background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
            padding: 16, border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)', marginBottom: 24,
        }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                {/* Search — matches dashboard form-card input */}
                <div style={{ position: 'relative', flex: '1 1 250px' }}>
                    <span className="material-symbols-outlined" style={{
                        position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 20, color: 'var(--text-muted)',
                    }}>search</span>
                    <input
                        type="text"
                        placeholder="Buscar colaborador..."
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        style={{
                            width: '100%', padding: '12px 16px 12px 44px',
                            borderRadius: 'var(--radius-md)',
                            border: '2px solid var(--border)',
                            background: 'var(--bg)', fontWeight: 600,
                            fontFamily: 'inherit', fontSize: '0.9rem',
                            transition: 'var(--transition)', outline: 'none',
                        }}
                        onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                    />
                </div>

                {/* Status Filter — matches dashboard .tab-nav style */}
                <div style={{
                    display: 'flex', gap: 4, background: 'var(--bg)', padding: 4,
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                }}>
                    {STATUS_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => onStatusFilterChange(opt.value)}
                            style={{
                                padding: '8px 14px', border: 'none',
                                fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                transition: 'var(--transition)',
                                display: 'flex', alignItems: 'center', gap: 4,
                                ...(statusFilter === opt.value
                                    ? { background: 'var(--primary)', color: 'white', boxShadow: '0 2px 8px rgba(230, 0, 126, 0.2)' }
                                    : { background: 'transparent', color: 'var(--text-muted)' }),
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{opt.icon}</span>
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onAddManual} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '10px 16px', border: '2px solid var(--border)',
                        borderRadius: 'var(--radius-md)', background: 'var(--bg)',
                        fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700,
                        color: 'var(--text-muted)', cursor: 'pointer',
                        transition: 'var(--transition)',
                    }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
                        Adicionar
                    </button>
                    {hasEntries && (
                        <button onClick={onExportCSV} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '10px 16px', border: '2px solid var(--border)',
                            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
                            fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700,
                            color: 'var(--text-muted)', cursor: 'pointer',
                            transition: 'var(--transition)',
                        }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--success)'; (e.currentTarget as HTMLElement).style.color = 'var(--success)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                            CSV
                        </button>
                    )}
                    {hasPending && onPayAll && (
                        <button onClick={async () => { if (await confirmDialog({ title: 'Pagar Todos', message: 'Deseja marcar todos os pendentes como pagos?', confirmText: 'Sim, pagar todos', variant: 'info' })) onPayAll(); }} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '10px 16px', border: 'none',
                            borderRadius: 'var(--radius-md)',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700,
                            color: '#fff', cursor: 'pointer',
                            transition: 'var(--transition)',
                            boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>done_all</span>
                            Pagar Todos
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
