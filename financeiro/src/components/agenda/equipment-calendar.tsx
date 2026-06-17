import React, { useMemo } from 'react';
import type { Aparelho } from '@/app/agenda/aparelhos/page';

interface Props {
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
  aparelhos: Aparelho[];
  isLoading: boolean;
  onDayClick: (day: Date) => void;
}

export function EquipmentCalendar({ currentDate, setCurrentDate, aparelhos, isLoading, onDayClick }: Props) {
  const goPrev = () => {
    const prev = new Date(currentDate);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentDate(prev);
  };
  const goNext = () => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + 1);
    setCurrentDate(next);
  };
  const goToday = () => setCurrentDate(new Date());

  const { days, blanks } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return {
      days: Array.from({ length: daysInMonth }, (_, i) => i + 1),
      blanks: Array.from({ length: firstDay }, (_, i) => i)
    };
  }, [currentDate]);

  const monthStr = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  // Map to easily find allocations per day
  const getAllocationsForDay = (day: number) => {
    const dateStr = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), day)).toISOString().split('T')[0];
    const allocs: { aparelho: Aparelho, unit: string }[] = [];
    
    aparelhos.forEach(ap => {
      const match = ap.alocacoes.find(a => a.date.startsWith(dateStr));
      if (match) allocs.push({ aparelho: ap, unit: match.unit });
    });
    return allocs;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, textTransform: 'capitalize' }}>{monthStr}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={goToday} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>Hoje</button>
          <button onClick={goPrev} style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span></button>
          <button onClick={goNext} style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span></button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{d}</div>
          ))}
        </div>
        
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', overflowY: 'auto' }}>
            {blanks.map(b => (
              <div key={`blank-${b}`} style={{ borderRight: '1px solid rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.1)' }} />
            ))}
            
            {days.map(day => {
              const allocs = getAllocationsForDay(day);
              const today = isToday(day);
              return (
                <div 
                  key={day} 
                  onClick={() => onDayClick(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                  style={{ 
                    borderRight: '1px solid rgba(255,255,255,0.03)', 
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    padding: 8,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    position: 'relative'
                  }}
                  className="calendar-day-hover"
                >
                  <div style={{ 
                    width: 24, height: 24, borderRadius: '50%', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: today ? 'var(--primary)' : 'transparent',
                    color: today ? '#fff' : 'var(--text-color)',
                    fontWeight: today ? 700 : 500,
                    fontSize: '0.85rem',
                    marginBottom: 6
                  }}>
                    {day}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {allocs.map((a, i) => (
                      <div key={i} style={{ 
                        background: `${a.aparelho.color}20`, 
                        borderLeft: `3px solid ${a.aparelho.color}`,
                        color: a.aparelho.color,
                        padding: '2px 6px',
                        borderRadius: '0 4px 4px 0',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {a.aparelho.name}: {a.unit}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .calendar-day-hover:hover { background: rgba(255,255,255,0.03); }
      `}} />
    </div>
  );
}
