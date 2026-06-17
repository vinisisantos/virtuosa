import React, { useMemo } from 'react';
import type { Aparelho } from '@/app/agenda/aparelhos/page';
import { MONTHS_PT } from '@/components/agenda/agenda-constants';

interface Props {
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
  aparelhos: Aparelho[];
  isLoading: boolean;
  onDayClick: (day: Date) => void;
}

export function EquipmentCalendar({ currentDate, setCurrentDate, aparelhos, isLoading, onDayClick }: Props) {
  const isSameDay = (d1: Date, d2: Date) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  const today = new Date();

  const { monthDays } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: Date[] = [];
    for (let i = firstDay - 1; i >= 0; i--) days.push(new Date(year, month, -i));
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    const remaining = days.length % 7 === 0 ? 0 : 7 - (days.length % 7);
    for (let i = 1; i <= remaining; i++) days.push(new Date(year, month + 1, i));

    return { monthDays: days };
  }, [currentDate]);

  const monthStr = `${MONTHS_PT[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const getAllocationsForDay = (day: Date) => {
    const dateStr = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())).toISOString().split('T')[0];
    const allocs: { aparelho: Aparelho; unit: string }[] = [];
    aparelhos.forEach(ap => {
      const match = ap.alocacoes.find(a => a.date.startsWith(dateStr));
      if (match) allocs.push({ aparelho: ap, unit: match.unit });
    });
    return allocs;
  };

  const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const btnNav: React.CSSProperties = {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    borderRadius: 10, color: '#fff', cursor: 'pointer', transition: 'all 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, textTransform: 'capitalize', margin: 0, letterSpacing: '-0.01em' }}>{monthStr}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setCurrentDate(new Date())}
            style={{ ...btnNav, width: 'auto', padding: '0 14px', fontSize: '0.85rem', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          >Hoje</button>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
            style={btnNav}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          ><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span></button>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
            style={btnNav}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          ><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span></button>
        </div>
      </div>

      {/* Day Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {DAYS_PT.map(d => (
          <div key={d} style={{
            padding: '12px 8px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem',
            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
            borderLeft: '1px solid var(--border)',
          }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', overflowY: 'auto' }}>
          {monthDays.map((d, i) => {
            const isTodayDay = isSameDay(d, today);
            const isCurrentMonth = d.getMonth() === currentDate.getMonth();
            const allocs = getAllocationsForDay(d);

            return (
              <div
                key={i}
                onClick={() => isCurrentMonth && onDayClick(d)}
                style={{
                  minHeight: 100, padding: '8px 10px',
                  borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                  cursor: isCurrentMonth ? 'pointer' : 'default',
                  background: isTodayDay ? 'rgba(230,0,126,0.04)' : !isCurrentMonth ? 'rgba(0,0,0,0.06)' : 'transparent',
                  transition: 'background 0.15s',
                  opacity: isCurrentMonth ? 1 : 0.3,
                }}
                onMouseEnter={e => { if (isCurrentMonth && !isTodayDay) e.currentTarget.style.background = 'rgba(230,0,126,0.04)'; }}
                onMouseLeave={e => { if (isCurrentMonth && !isTodayDay) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Day Number */}
                <div style={{
                  fontWeight: isTodayDay ? 800 : 600, fontSize: '0.85rem', marginBottom: 6,
                  ...(isTodayDay
                    ? { background: 'var(--primary)', color: '#fff', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(230,0,126,0.3)' }
                    : { color: 'var(--text-main)' }
                  ),
                }}>
                  {isCurrentMonth ? d.getDate() : ''}
                </div>

                {/* Allocation Chips */}
                {isCurrentMonth && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {allocs.map((a, idx) => (
                      <div key={idx} style={{
                        background: `${a.aparelho.color}18`,
                        borderLeft: `3px solid ${a.aparelho.color}`,
                        color: a.aparelho.color,
                        padding: '4px 8px', borderRadius: 5,
                        fontSize: '0.68rem', fontWeight: 700,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {a.aparelho.name} • {a.unit}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
