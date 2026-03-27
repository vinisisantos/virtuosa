import React from 'react';
import type { Agendamento } from './agenda-constants';
import { HOURS, DAYS_PT, ROW_H, START_HOUR, isSameDay, getWeekDays, cardS, renderAppointmentCard } from './agenda-constants';

interface Props {
  currentDate: Date;
  agendamentos: Agendamento[];
  now: Date;
  gridRef: React.RefObject<HTMLDivElement | null>;
  setCurrentDate: (d: Date) => void;
  setView: (v: 'day' | 'week' | 'month') => void;
  openNewModal: (date?: Date, hour?: string) => void;
  openEditModal: (ag: Agendamento) => void;
}

export function AgendaWeekView({ currentDate, agendamentos, now, gridRef, setCurrentDate, setView, openNewModal, openEditModal }: Props) {
  const today = new Date();
  const weekDays = getWeekDays(currentDate);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - START_HOUR * 60) / 30) * ROW_H;
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= 21 * 60;

  return (
    <div style={{ ...cardS, overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(7, 1fr)`, borderBottom: '2px solid var(--border)' }}>
        <div style={{ padding: '12px 8px' }} />
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={i} onClick={() => { setCurrentDate(d); setView('day'); }} style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s', background: isToday ? 'rgba(230,0,126,0.05)' : 'transparent' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{DAYS_PT[d.getDay()]}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isToday ? '#fff' : 'var(--text-main)', background: isToday ? 'var(--primary)' : 'transparent', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      {/* Grid */}
      <div ref={gridRef} style={{ position: 'relative', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(7, 1fr)`, position: 'relative' }}>
          <div>
            {HOURS.map((h, i) => (
              <div key={h} style={{ height: ROW_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8, paddingTop: 2, fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', borderTop: i > 0 ? '1px solid var(--border)' : 'none', opacity: h.endsWith(':30') ? 0.5 : 1 }}>
                {h}
              </div>
            ))}
          </div>
          {weekDays.map((d, di) => (
            <div key={di} style={{ position: 'relative', borderLeft: '1px solid var(--border)' }}>
              {HOURS.map((h, i) => (
                <div key={h} onClick={() => openNewModal(d, h)} style={{ height: ROW_H, borderTop: i > 0 ? `1px ${h.endsWith(':30') ? 'dashed' : 'solid'} var(--border)` : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(230,0,126,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                />
              ))}
              {agendamentos.filter(a => isSameDay(new Date(a.startTime), d)).map(a => renderAppointmentCard(a, openEditModal, 100))}
            </div>
          ))}
        </div>
        {/* Now line */}
        {showNowLine && weekDays.some(d => isSameDay(d, today)) && (
          <div style={{ position: 'absolute', top: nowTop, left: 56, right: 0, height: 2, background: '#ef4444', zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5, background: '#ef4444' }} />
          </div>
        )}
      </div>
    </div>
  );
}
