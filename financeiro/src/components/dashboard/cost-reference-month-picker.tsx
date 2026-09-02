'use client';

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

interface CostReferenceMonthPickerProps {
  value: string;
  dueDate: string;
  selectedYear: number;
  onChange: (value: string) => void;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 46,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-main)',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
};

export function CostReferenceMonthPicker({ value, dueDate, selectedYear, onChange }: CostReferenceMonthPickerProps) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  const month = match?.[2] || '';
  const year = Number(match?.[1]) || Number(dueDate.slice(0, 4)) || selectedYear;
  const yearOptions = Array.from(new Set([
    ...Array.from({ length: 11 }, (_, index) => selectedYear - 5 + index),
    year,
  ])).sort((left, right) => left - right);

  const handleMonthChange = (nextMonth: string) => {
    onChange(nextMonth ? `${year}-${nextMonth}` : '');
  };

  const handleYearChange = (nextYear: string) => {
    if (month) onChange(`${nextYear}-${month}`);
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Mês de Referência (Opcional)</label>
      <div className="cost-reference-month-picker" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(110px, 0.7fr)', gap: 10 }}>
        <select
          aria-label="Mês de referência"
          value={month}
          onChange={event => handleMonthChange(event.target.value)}
          style={selectStyle}
        >
          <option value="">Usar o mês do vencimento</option>
          {MONTHS.map((monthLabel, index) => (
            <option key={monthLabel} value={String(index + 1).padStart(2, '0')}>{monthLabel}</option>
          ))}
        </select>
        <select
          aria-label="Ano de referência"
          value={year}
          disabled={!month}
          onChange={event => handleYearChange(event.target.value)}
          style={{ ...selectStyle, opacity: month ? 1 : 0.55 }}
        >
          {yearOptions.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.4 }}>
        Se ficar vazio, a despesa usa automaticamente o mês do vencimento.
      </div>
      <style>{`
        @media (max-width: 640px) {
          .cost-reference-month-picker { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
