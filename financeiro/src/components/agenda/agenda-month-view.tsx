import React from 'react';
import type { Agendamento } from './agenda-constants';
import { DAYS_PT, STATUS_COLORS, isSameDay, getMonthDays, cardS } from './agenda-constants';

interface Props {
  currentDate: Date;
  agendamentos: Agendamento[];
  setCurrentDate: (d: Date) => void;
  setView: (v: 'day' | 'week' | 'month') => void;
}

export function AgendaMonthView({ currentDate, agendamentos, setCurrentDate, setView }: Props) {
  const today = new Date();
  const monthDays = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());

  return (
    <div style={{ ...cardS, overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid var(--border)' }}>
        {DAYS_PT.map(d => (
          <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', borderLeft: '1px solid var(--border)' }}>{d}</div>
        ))}
      </div>
      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {monthDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          const isCurrentMonth = d.getMonth() === currentDate.getMonth();
          const dayAppts = agendamentos.filter(a => isSameDay(new Date(a.startTime), d));
          return (
            <div key={i} onClick={() => { setCurrentDate(d); setView('day'); }}
              style={{
                minHeight: 90, padding: '6px 8px', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                cursor: 'pointer', background: isToday ? 'rgba(230,0,126,0.03)' : !isCurrentMonth ? 'rgba(0,0,0,0.02)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'rgba(230,0,126,0.03)'; }}
              onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = !isCurrentMonth ? 'rgba(0,0,0,0.02)' : 'transparent'; }}
            >
              <div style={{ fontWeight: isToday ? 900 : 600, fontSize: '0.85rem', color: !isCurrentMonth ? 'var(--text-muted)' : isToday ? 'var(--primary)' : 'var(--text-main)', marginBottom: 4, ...(isToday ? { background: 'var(--primary)', color: '#fff', width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}) }}>
                {d.getDate()}
              </div>
              {dayAppts.slice(0, 3).map(a => {
                const st = STATUS_COLORS[a.status] || STATUS_COLORS.pendente;
                return (
                  <div key={a.id} style={{ background: st.bg, borderLeft: `3px solid ${st.border}`, borderRadius: 4, padding: '2px 6px', marginBottom: 2, fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: st.text }}>
                    {new Date(a.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {a.clientName}
                  </div>
                );
              })}
              {dayAppts.length > 3 && <div style={{ fontSize: '0.62rem', color: 'var(--primary)', fontWeight: 700, textAlign: 'center' }}>+{dayAppts.length - 3} mais</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
