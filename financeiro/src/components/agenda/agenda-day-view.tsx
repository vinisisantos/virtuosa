import React, { useCallback } from 'react';
import type { Agendamento, Profissional } from './agenda-constants';
import { HOURS, ROW_H, START_HOUR, STATUS_COLORS, isSameDay, cardS } from './agenda-constants';

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

const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Status color mapping inspired by the reference system
const STATUS_BLOCK: Record<string, { bg: string; borderColor: string; dotColor: string; textColor: string }> = {
  pendente:       { bg: 'rgba(59,130,246,0.10)', borderColor: '#3b82f6', dotColor: '#3b82f6', textColor: '#1e40af' },
  confirmado:     { bg: 'rgba(16,185,129,0.12)', borderColor: '#10b981', dotColor: '#10b981', textColor: '#065f46' },
  em_atendimento: { bg: 'rgba(99,102,241,0.12)', borderColor: '#6366f1', dotColor: '#6366f1', textColor: '#4338ca' },
  finalizado:     { bg: 'rgba(16,185,129,0.08)', borderColor: '#34d399', dotColor: '#34d399', textColor: '#065f46' },
  falta:          { bg: 'rgba(239,68,68,0.10)', borderColor: '#ef4444', dotColor: '#ef4444', textColor: '#991b1b' },
  cancelado:      { bg: 'rgba(156,163,175,0.10)', borderColor: '#9ca3af', dotColor: '#9ca3af', textColor: '#6b7280' },
};

export function AgendaDayView({ currentDate, agendamentos, profissionais, now, gridRef, openNewModal, openEditModal, reschedule }: Props) {
  const today = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - START_HOUR * 60) / 30) * ROW_H;
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= 21 * 60;

  // Use profissionais as columns, or a single "Todos" column
  const cols = profissionais.length > 0
    ? profissionais
    : [{ id: 'all', name: 'Todos', color: '#e600a0', unit: '', isActive: true } as Profissional];

  // Add special columns
  const specialCols = [
    { id: '__falta', name: 'Falta / Cancelado', color: '#ef4444', unit: '', isActive: true },
  ];
  const allCols = [...cols, ...specialCols] as Profissional[];

  // Drag & Drop
  const handleDragStart = useCallback((e: React.DragEvent, ag: Agendamento) => {
    e.dataTransfer.setData('agendamentoId', ag.id);
    e.dataTransfer.setData('durationMs', String(new Date(ag.endTime).getTime() - new Date(ag.startTime).getTime()));
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.background = 'rgba(99,102,241,0.06)';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.background = 'transparent';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, hour: string) => {
    e.preventDefault();
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.background = 'transparent';
    const agId = e.dataTransfer.getData('agendamentoId');
    const durationMs = parseInt(e.dataTransfer.getData('durationMs') || '3600000');
    if (!agId || !reschedule) return;
    const [h, m] = hour.split(':').map(Number);
    const newStart = new Date(currentDate);
    newStart.setHours(h, m, 0, 0);
    reschedule(agId, newStart, new Date(newStart.getTime() + durationMs));
  }, [currentDate, reschedule]);

  // Get appointments for a specific column
  const getColAgendamentos = (colId: string) => {
    const dayAgendamentos = agendamentos.filter(a => isSameDay(new Date(a.startTime), currentDate));
    if (colId === '__falta') {
      return dayAgendamentos.filter(a => a.status === 'falta' || a.status === 'cancelado');
    }
    if (colId === 'all') return dayAgendamentos;
    return dayAgendamentos.filter(a => a.profissionalId === colId && a.status !== 'falta' && a.status !== 'cancelado');
  };

  return (
    <div style={{ ...cardS, overflow: 'hidden' }}>
      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `56px ${allCols.map(() => '1fr').join(' ')}`,
        borderBottom: '2px solid var(--border)',
        background: 'var(--card-bg)',
        position: 'sticky', top: 0, zIndex: 5,
      }}>
        <div style={{ padding: '10px 4px', fontWeight: 700, fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Hora
        </div>
        {allCols.map((p, idx) => (
          <div key={p.id} style={{
            padding: '8px 6px', textAlign: 'center', borderLeft: '1px solid var(--border)',
            background: idx < cols.length ? 'transparent' : 'rgba(239,68,68,0.03)',
          }}>
            <div style={{
              fontWeight: 800, fontSize: '0.8rem',
              color: p.id === '__falta' ? '#ef4444' : 'var(--text-main)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {p.id !== '__falta' && p.id !== 'all' && (
                <div style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
              )}
              {p.name}
            </div>
            {p.id !== '__falta' && p.id !== 'all' && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
                {getColAgendamentos(p.id).length} agend.
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div ref={gridRef} style={{ position: 'relative', overflowY: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `56px ${allCols.map(() => '1fr').join(' ')}`,
          position: 'relative',
        }}>
          {/* Time labels column */}
          <div style={{ position: 'relative' }}>
            {HOURS.map((h, i) => (
              <div key={h} style={{
                height: ROW_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                paddingRight: 6, paddingTop: 2, fontSize: '0.68rem', fontWeight: 700,
                color: h.endsWith(':00') ? 'var(--text-main)' : 'var(--text-muted)',
                borderTop: i > 0 ? `1px ${h.endsWith(':30') ? 'dashed' : 'solid'} var(--border)` : 'none',
                opacity: h.endsWith(':30') ? 0.5 : 1,
              }}>
                {h.endsWith(':00') ? h : ''}
              </div>
            ))}
          </div>

          {/* Professional columns */}
          {allCols.map((prof, colIdx) => {
            const colAgendamentos = getColAgendamentos(prof.id);
            const isFaltaCol = prof.id === '__falta';

            return (
              <div key={prof.id} style={{
                position: 'relative', borderLeft: '1px solid var(--border)',
                background: isFaltaCol ? 'rgba(239,68,68,0.02)' : 'transparent',
              }}>
                {/* Time slot cells */}
                {HOURS.map((h, i) => (
                  <div key={h}
                    onClick={() => !isFaltaCol && openNewModal(currentDate, h)}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, h)}
                    style={{
                      height: ROW_H,
                      borderTop: i > 0 ? `1px ${h.endsWith(':30') ? 'dashed' : 'solid'} var(--border)` : 'none',
                      cursor: isFaltaCol ? 'default' : 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isFaltaCol) e.currentTarget.style.background = 'rgba(230,0,126,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  />
                ))}

                {/* Appointment blocks */}
                {colAgendamentos.map(ag => {
                  const startD = new Date(ag.startTime);
                  const endD = new Date(ag.endTime);
                  const startMin = startD.getHours() * 60 + startD.getMinutes();
                  const endMin = endD.getHours() * 60 + endD.getMinutes();
                  const top = ((startMin - START_HOUR * 60) / 30) * ROW_H;
                  const height = Math.max(ROW_H * 0.8, ((endMin - startMin) / 30) * ROW_H - 2);
                  const sc = STATUS_BLOCK[ag.status] || STATUS_BLOCK.pendente;
                  const isNow = now >= startD && now <= endD && isSameDay(currentDate, today);

                  return (
                    <div key={ag.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, ag)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openEditModal(ag)}
                      style={{
                        position: 'absolute', top, left: 3, right: 3, height,
                        background: sc.bg,
                        borderLeft: `4px solid ${sc.borderColor}`,
                        borderRadius: 6, padding: '4px 8px', cursor: 'grab',
                        overflow: 'hidden', fontSize: '0.72rem', zIndex: 2,
                        transition: 'all 0.15s',
                        boxShadow: isNow ? `0 0 0 2px ${sc.borderColor}, 0 2px 8px rgba(0,0,0,0.15)` : '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 0 1px ${sc.borderColor}, 0 4px 12px rgba(0,0,0,0.12)`; e.currentTarget.style.transform = 'scale(1.01)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = isNow ? `0 0 0 2px ${sc.borderColor}, 0 2px 8px rgba(0,0,0,0.15)` : '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      {/* Time + status dot */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: sc.dotColor, flexShrink: 0 }} />
                        <span style={{ fontWeight: 800, color: sc.textColor, fontSize: '0.72rem' }}>
                          {fmtTime(startD)} - {fmtTime(endD)}
                        </span>
                        {/* Icons */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, flexShrink: 0 }}>
                          {ag.clientPhone && (
                            <span style={{ fontSize: '0.6rem', cursor: 'pointer' }} title="WhatsApp">💬</span>
                          )}
                          {ag.sessionNumber && ag.totalSessions && (
                            <span style={{
                              fontSize: '0.58rem', fontWeight: 800, padding: '0 4px', borderRadius: 3,
                              background: 'rgba(230,0,126,0.1)', color: 'var(--primary)',
                            }}>
                              S
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Client name + session */}
                      <div style={{
                        fontWeight: 700, color: 'var(--text-main)', marginTop: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontSize: '0.73rem', lineHeight: 1.3,
                      }}>
                        {ag.clientName}
                        {ag.sessionNumber && ag.totalSessions && (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.65rem' }}>
                            {' '}({ag.sessionNumber}/{ag.totalSessions})
                          </span>
                        )}
                      </div>
                      {/* Procedure (only if enough height) */}
                      {height > 48 && (
                        <div style={{
                          color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600, marginTop: 1,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {ag.procedimento}
                        </div>
                      )}
                      {/* Sala info (only if enough height) */}
                      {height > 64 && ag.sala && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 600, marginTop: 1, opacity: 0.7 }}>
                          📍 {ag.sala}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Now line */}
        {showNowLine && isSameDay(currentDate, today) && (
          <div style={{
            position: 'absolute', top: nowTop, left: 52, right: 0, height: 2,
            background: '#ef4444', zIndex: 10, pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5, background: '#ef4444',
            }} />
            <div style={{
              position: 'absolute', left: 8, top: -8, fontSize: '0.6rem', fontWeight: 800, color: '#ef4444',
              background: 'var(--card-bg)', padding: '0 4px', borderRadius: 3,
            }}>
              {fmtTime(now)}
            </div>
          </div>
        )}
      </div>

      {/* Legend footer */}
      <div style={{
        padding: '10px 16px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
        background: 'var(--bg)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
      }}>
        {Object.entries(STATUS_BLOCK).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: val.dotColor, border: `1px solid ${val.borderColor}` }} />
            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
              {STATUS_COLORS[key]?.label || key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
