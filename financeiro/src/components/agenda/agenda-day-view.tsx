import React, { useCallback } from 'react';
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
  reschedule?: (id: string, newStart: Date, newEnd: Date) => void;
}

export function AgendaDayView({ currentDate, agendamentos, profissionais, now, gridRef, openNewModal, openEditModal, reschedule }: Props) {
  const today = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - START_HOUR * 60) / 30) * ROW_H;
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= 21 * 60;

  const cols = profissionais.length > 0 ? profissionais : [{ id: 'all', name: 'Todos', color: '#e600a0', unit: '', isActive: true } as Profissional];

  // Drag & Drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, ag: Agendamento) => {
    e.dataTransfer.setData('agendamentoId', ag.id);
    const duration = new Date(ag.endTime).getTime() - new Date(ag.startTime).getTime();
    e.dataTransfer.setData('durationMs', String(duration));
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.background = 'rgba(99,102,241,0.08)';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.background = 'transparent';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, hour: string) => {
    e.preventDefault();
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.background = 'transparent';
    }
    const agId = e.dataTransfer.getData('agendamentoId');
    const durationMs = parseInt(e.dataTransfer.getData('durationMs') || '3600000');
    if (!agId || !reschedule) return;

    const [h, m] = hour.split(':').map(Number);
    const newStart = new Date(currentDate);
    newStart.setHours(h, m, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    reschedule(agId, newStart, newEnd);
  }, [currentDate, reschedule]);

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
                <div key={h}
                  onClick={() => openNewModal(currentDate, h)}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, h)}
                  style={{ height: ROW_H, borderTop: i > 0 ? `1px ${h.endsWith(':30') ? 'dashed' : 'solid'} var(--border)` : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(230,0,126,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                />
              ))}
              {agendamentos
                .filter(a => isSameDay(new Date(a.startTime), currentDate) && (prof.id === 'all' || a.profissionalId === prof.id))
                .map(a => {
                  const card = renderAppointmentCard(a, openEditModal);
                  // Wrap card in a draggable container
                  return (
                    <div key={a.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, a)}
                      onDragEnd={handleDragEnd}
                      style={{ position: 'absolute', left: card.props.style?.left || 2, right: card.props.style?.right || 2, top: card.props.style?.top, height: card.props.style?.height, cursor: 'grab', zIndex: card.props.style?.zIndex }}
                    >
                      {React.cloneElement(card, { key: a.id, style: { ...card.props.style, position: 'relative', top: 0, left: 0, right: 0, height: '100%', cursor: 'grab' } })}
                    </div>
                  );
                })}
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
