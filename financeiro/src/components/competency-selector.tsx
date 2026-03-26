'use client';

interface CompetencySelectorProps {
    month: number;
    year: number;
    onChangeMonth: (month: number) => void;
    onChangeYear: (year: number) => void;
}

const MONTHS = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export function CompetencySelector({ month, year, onChangeMonth, onChangeYear }: CompetencySelectorProps) {
    const handlePrev = () => { if (month === 1) { onChangeMonth(12); onChangeYear(year - 1); } else onChangeMonth(month - 1); };
    const handleNext = () => { if (month === 12) { onChangeMonth(1); onChangeYear(year + 1); } else onChangeMonth(month + 1); };

    return (
        <div style={{ margin: '0 0 20px' }}>
            {/* Month selector — matches dashboard .month-selector-wrapper */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, flexWrap: 'wrap',
                background: 'var(--card-bg)', padding: 6,
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
            }}>
                {/* Year nav */}
                <button onClick={handlePrev} style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    padding: '8px 12px', fontFamily: 'inherit', fontWeight: 700,
                    color: 'var(--text-muted)', borderRadius: 'var(--radius-md)',
                    transition: 'var(--transition)', fontSize: '0.85rem',
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle' }}>chevron_left</span>
                </button>

                {MONTHS.map((m, i) => (
                    <button
                        key={m}
                        onClick={() => onChangeMonth(i + 1)}
                        style={{
                            padding: '10px 16px', border: 'none',
                            fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700,
                            borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            transition: 'var(--transition)',
                            ...(month === i + 1
                                ? { background: 'var(--primary)', color: 'white', boxShadow: '0 4px 12px rgba(230, 0, 126, 0.25)' }
                                : { background: 'transparent', color: 'var(--text-muted)' }),
                        }}
                    >
                        {m}
                    </button>
                ))}

                <button onClick={handleNext} style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    padding: '8px 12px', fontFamily: 'inherit', fontWeight: 700,
                    color: 'var(--text-muted)', borderRadius: 'var(--radius-md)',
                    transition: 'var(--transition)', fontSize: '0.85rem',
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle' }}>chevron_right</span>
                </button>

                {/* Year display */}
                <span style={{
                    padding: '8px 16px', fontWeight: 800, fontSize: '0.9rem',
                    color: 'var(--text-main)', borderLeft: '1px solid var(--border)',
                    marginLeft: 4,
                }}>
                    {year}
                </span>
            </div>
        </div>
    );
}
