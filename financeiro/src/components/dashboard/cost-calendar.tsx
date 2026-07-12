'use client';

import { useMemo } from 'react';
import { Bill, FixedExpense, fmt, MONTHS } from '@/hooks/useDashboard';
import { recurringCostOccurrencesInMonth } from '@/lib/cost-recurrence';

interface CostCalendarProps {
  fixedExpenses: FixedExpense[];
  bills: Bill[];
  selectedMonth: number;
  selectedYear: number;
}

interface CalendarCost {
  key: string;
  name: string;
  value: number;
  category: string;
  day: number;
  isPaid: boolean;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseLocalDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return { year, month: month - 1, day };
}

export function CostCalendar({ fixedExpenses, bills, selectedMonth, selectedYear }: CostCalendarProps) {
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstWeekday = new Date(selectedYear, selectedMonth, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === selectedYear && today.getMonth() === selectedMonth;

  const costsByDay = useMemo(() => {
    const grouped = new Map<number, CalendarCost[]>();
    const addCost = (cost: CalendarCost) => {
      const current = grouped.get(cost.day) || [];
      current.push(cost);
      grouped.set(cost.day, current);
    };

    fixedExpenses.forEach(expense => {
      recurringCostOccurrencesInMonth(expense, selectedYear, selectedMonth).forEach(dateKey => {
        addCost({
          key: `fixed-${expense.id}-${dateKey}`,
          name: expense.name,
          value: expense.value,
          category: expense.category,
          day: Number(dateKey.slice(8, 10)),
          isPaid: false,
        });
      });
    });

    bills.forEach(bill => {
      if (bill.type === 'fixo') {
        const day = Math.min(bill.dueDay || 1, daysInMonth);
        const paymentKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
        addCost({
          key: `bill-${bill.id}`,
          name: bill.name,
          value: bill.value,
          category: bill.category,
          day,
          isPaid: bill.payments?.[paymentKey] === true,
        });
        return;
      }

      const dueDate = parseLocalDate(bill.dueDateManual);
      if (!dueDate || dueDate.year !== selectedYear || dueDate.month !== selectedMonth) return;
      addCost({
        key: `bill-${bill.id}`,
        name: bill.name,
        value: bill.value,
        category: bill.category,
        day: dueDate.day,
        isPaid: bill.payments?.[bill.dueDateManual || ''] === true,
      });
    });

    grouped.forEach(costs => costs.sort((a, b) => b.value - a.value));
    return grouped;
  }, [bills, daysInMonth, fixedExpenses, selectedMonth, selectedYear]);

  const calendarCells = useMemo(() => {
    const previousMonthDays = new Date(selectedYear, selectedMonth, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const offsetDay = index - firstWeekday + 1;
      if (offsetDay < 1) return { day: previousMonthDays + offsetDay, inCurrentMonth: false };
      if (offsetDay > daysInMonth) return { day: offsetDay - daysInMonth, inCurrentMonth: false };
      return { day: offsetDay, inCurrentMonth: true };
    });
  }, [daysInMonth, firstWeekday, selectedMonth, selectedYear]);

  const monthTotal = Array.from(costsByDay.values()).flat().reduce((sum, cost) => sum + cost.value, 0);

  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 16, overflowX: 'auto', background: 'var(--card-bg)' }}>
      <div style={{ minWidth: 840 }}>
      <header style={{ minHeight: 64, padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{MONTHS[selectedMonth]} de {selectedYear}</div>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{Array.from(costsByDay.values()).flat().length} pagamentos programados</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Total previsto</div>
          <div style={{ color: 'var(--text-main)', fontSize: '1rem', fontWeight: 850 }}>{fmt(monthTotal)}</div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        {WEEKDAYS.map(day => (
          <div key={day} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 750 }}>{day}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {calendarCells.map((cell, index) => {
          const dayCosts = cell.inCurrentMonth ? costsByDay.get(cell.day) || [] : [];
          const isToday = cell.inCurrentMonth && isCurrentMonth && cell.day === today.getDate();
          return (
            <div
              key={`${cell.inCurrentMonth ? 'current' : 'outside'}-${index}`}
              style={{
                minWidth: 0,
                minHeight: 142,
                padding: 8,
                borderRight: index % 7 === 6 ? 'none' : '1px solid var(--border)',
                borderBottom: index >= 35 ? 'none' : '1px solid var(--border)',
                background: cell.inCurrentMonth ? 'transparent' : 'color-mix(in srgb, var(--bg) 55%, transparent)',
              }}
            >
              <div style={{ width: 28, height: 28, marginBottom: 6, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? 'var(--primary)' : 'transparent', color: isToday ? '#fff' : cell.inCurrentMonth ? 'var(--text-main)' : 'var(--text-muted)', opacity: cell.inCurrentMonth ? 1 : 0.4, fontSize: '0.78rem', fontWeight: 800 }}>
                {cell.day}
              </div>

              <div style={{ display: 'grid', gap: 5 }}>
                {dayCosts.slice(0, 3).map(cost => (
                  <article
                    key={cost.key}
                    title={`${cost.name} · ${fmt(cost.value)}`}
                    style={{
                      minWidth: 0,
                      padding: '7px 8px',
                      borderRadius: 8,
                      border: `1px solid ${cost.isPaid ? 'rgba(34,197,94,0.28)' : 'rgba(139,92,246,0.28)'}`,
                      background: cost.isPaid ? 'rgba(34,197,94,0.08)' : 'rgba(139,92,246,0.08)',
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)', fontSize: '0.72rem', fontWeight: 750 }}>{cost.name}</div>
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.62rem' }}>{cost.category}</span>
                      <strong style={{ flexShrink: 0, color: cost.isPaid ? '#22c55e' : 'var(--text-main)', fontSize: '0.66rem' }}>{fmt(cost.value)}</strong>
                    </div>
                  </article>
                ))}
                {dayCosts.length > 3 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700, paddingLeft: 4 }}>+{dayCosts.length - 3} pagamentos</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </section>
  );
}
