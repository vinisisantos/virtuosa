'use client';

import styles from './competency-selector.module.css';

interface CompetencySelectorProps {
    month: number;
    year: number;
    onChangeMonth: (month: number) => void;
    onChangeYear: (year: number) => void;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function CompetencySelector({ month, year, onChangeMonth, onChangeYear }: CompetencySelectorProps) {
    const handlePrev = () => {
        if (month === 1) {
            onChangeMonth(12);
            onChangeYear(year - 1);
        } else onChangeMonth(month - 1);
    };
    const handleNext = () => {
        if (month === 12) {
            onChangeMonth(1);
            onChangeYear(year + 1);
        } else onChangeMonth(month + 1);
    };

    return (
        <div className={styles.wrapper} aria-label="Competência da folha">
            <button className={styles.navButton} onClick={handlePrev} aria-label="Competência anterior">
                <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <div className={styles.desktopMonths}>
                {MONTHS.map((label, index) => (
                    <button
                        key={label}
                        className={month === index + 1 ? styles.activeMonth : styles.monthButton}
                        onClick={() => onChangeMonth(index + 1)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className={styles.mobileCompetence}>
                <select value={month} onChange={event => onChangeMonth(Number(event.target.value))} aria-label="Mês">
                    {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
                </select>
                <strong>{year}</strong>
            </div>

            <button className={styles.navButton} onClick={handleNext} aria-label="Próxima competência">
                <span className="material-symbols-outlined">chevron_right</span>
            </button>
            <span className={styles.year}>{year}</span>
        </div>
    );
}
