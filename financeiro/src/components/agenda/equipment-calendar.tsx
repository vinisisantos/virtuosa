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
    // Previous month blanks
    for (let i = firstDay - 1; i >= 0; i--) days.push(new Date(year, month, -i));
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    // Next month blanks to fill the last week
    const remaining = days.length % 7 === 0 ? 0 : 7 - (days.length % 7);
    for (let i = 1; i <= remaining; i++) days.push(new Date(year, month + 1, i));

    return { monthDays: days };
  }, [currentDate]);

  const monthStr = `${MONTHS_PT[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;

  const getAllocationsForDay = (day: Date) => {
    const dateStr = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())).toISOString().split('T')[0];
    const allocs: { aparelho: Aparelho, unit: string, userName?: string }[] = [];
    aparelhos.forEach(ap => {
      const match = ap.alocacoes.find(a => a.date.startsWith(dateStr));
      if (match) allocs.push({ aparelho: ap, unit: match.unit, userName: (match as any).userName });
    });
    return allocs;
  };

  const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, textTransform: 'capitalize' }}>{monthStr}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCurrentDate(new Date())} style={{ padding: '6px 12px', background: 'var(--border)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Hoje</button>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} style={{ padding: '6px 8px', background: 'var(--border)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span></button>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} style={{ padding: '6px 8px', background: 'var(--border)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span></button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid var(--border)' }}>
          {DAYS_PT.map(d => (
            <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', borderLeft: '1px solid var(--border)' }}>{d}</div>
          ))}
        </div>
        
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
                  onClick={() => onDayClick(d)}
                  style={{ 
                    minHeight: 110, padding: '6px 8px', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                    cursor: 'pointer', background: isTodayDay ? 'rgba(230,0,126,0.03)' : !isCurrentMonth ? 'rgba(0,0,0,0.02)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isTodayDay) e.currentTarget.style.background = 'rgba(230,0,126,0.03)'; }}
                  onMouseLeave={e => { if (!isTodayDay) e.currentTarget.style.background = !isCurrentMonth ? 'rgba(0,0,0,0.02)' : 'transparent'; }}
                >
                  <div style={{ fontWeight: isTodayDay ? 900 : 600, fontSize: '0.85rem', color: !isCurrentMonth ? 'var(--text-muted)' : isTodayDay ? 'var(--primary)' : 'var(--text-main)', marginBottom: 6, ...(isTodayDay ? { background: 'var(--primary)', color: '#fff', width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}) }}>
                    {isCurrentMonth ? d.getDate() : ''}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {allocs.map((a, idx) => (
                      <div key={idx} style={{ 
                        background: `${a.aparelho.color}20`, 
                        borderLeft: `3px solid ${a.aparelho.color}`,
                        color: a.aparelho.color,
                        padding: '3px 6px',
                        borderRadius: 4,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <span>{a.aparelho.name}: {a.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
