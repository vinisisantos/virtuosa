import React from 'react';
import type { Agendamento, Profissional } from './agenda-constants';
import { HOURS, ROW_H, START_HOUR, isSameDay, cardS, renderAppointmentCard } from './agenda-constants';

interface Props {
  currentDate: Date;
  agendamentos: Agendamento[];
  profissionais: Profissional[];
  now: Date;
  gridRef: React.RefObject<HTMLDivElement | null>;
  openNewModal: (date?: Date, hour?: string) => void;
  openEditModal: (ag: Agendamento) => void;
}

export function AgendaDayView({ currentDate, agendamentos, profissionais, now, gridRef, openNewModal, openEditModal }: Props) {
  const today = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - START_HOUR * 60) / 30) * ROW_H;
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= 21 * 60;

  const cols = profissionais.length > 0 ? profissionais : [{ id: 'all', name: 'Todos', color: '#e600a0', unit: '', isActive: true } as Profissional];

  return (
    <div style={{ ...cardS, overflow: 'hidden' }}>
      {/* Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `60px ${cols.map(() => '1fr').join(' ')}`, borderBottom: '2px solid var(--border)' }}>
        <div style={{ padding: '12px 8px', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Hora</div>
        {cols.map(p => (
          <div key={p.id} style={{ padding: '10px 12px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{p.name}</div>
            {p.id !== 'all' && <div style={{ width: 20, height: 3, borderRadius: 2, background: p.color, margin: '4px auto 0' }} />}
          </div>
        ))}
      </div>
      {/* Grid */}
      <div ref={gridRef} style={{ position: 'relative', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `60px ${cols.map(() => '1fr').join(' ')}`, position: 'relative' }}>
          {/* Time labels */}
          <div style={{ position: 'relative' }}>
            {HOURS.map((h, i) => (
              <div key={h} style={{ height: ROW_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8, paddingTop: 2, fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', borderTop: i > 0 ? '1px solid var(--border)' : 'none', opacity: h.endsWith(':30') ? 0.5 : 1 }}>
                {h}
              </div>
            ))}
          </div>
          {/* Columns */}
          {cols.map(prof => (
            <div key={prof.id} style={{ position: 'relative', borderLeft: '1px solid var(--border)' }}>
              {HOURS.map((h, i) => (
                <div key={h} onClick={() => openNewModal(currentDate, h)} style={{ height: ROW_H, borderTop: i > 0 ? `1px ${h.endsWith(':30') ? 'dashed' : 'solid'} var(--border)` : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(230,0,126,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                />
              ))}
              {agendamentos
                .filter(a => isSameDay(new Date(a.startTime), currentDate) && (prof.id === 'all' || a.profissionalId === prof.id))
                .map(a => renderAppointmentCard(a, openEditModal))}
            </div>
          ))}
        </div>
        {/* Now line */}
        {showNowLine && isSameDay(currentDate, today) && (
          <div style={{ position: 'absolute', top: nowTop, left: 56, right: 0, height: 2, background: '#ef4444', zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5, background: '#ef4444' }} />
          </div>
        )}
      </div>
    </div>
  );
}
