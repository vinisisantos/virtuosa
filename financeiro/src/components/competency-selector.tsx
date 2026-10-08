'use client';

import styles from './competency-selector.module.css';

interface CompetencySelectorProps {
    month: number;
    year: number;
    onChangePeriod: (period: { month: number; year: number }) => void;
    label?: string;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function CompetencySelector({ month, year, onChangePeriod, label = 'Mês' }: CompetencySelectorProps) {
    const handlePrev = () => {
        onChangePeriod(month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year });
    };
    const handleNext = () => {
        onChangePeriod(month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year });
    };

    return (
        <div className={styles.wrapper} aria-label={label}>
            <button className={styles.navButton} onClick={handlePrev} aria-label="Mês anterior">
                <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <div className={styles.desktopMonths}>
                {MONTHS.map((label, index) => (
                    <button
                        key={label}
                        className={month === index + 1 ? styles.activeMonth : styles.monthButton}
                        onClick={() => onChangePeriod({ month: index + 1, year })}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className={styles.mobileCompetence}>
                <select value={month} onChange={event => onChangePeriod({ month: Number(event.target.value), year })} aria-label="Mês">
                    {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
                </select>
                <strong>{year}</strong>
            </div>

            <button className={styles.navButton} onClick={handleNext} aria-label="Próximo mês">
                <span className="material-symbols-outlined">chevron_right</span>
            </button>
            <span className={styles.year}>{year}</span>
        </div>
    );
}
