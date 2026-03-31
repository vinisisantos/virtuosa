import React, { useCallback, useState, useRef, useEffect } from 'react';
import type { Agendamento, Profissional } from './agenda-constants';
import { HOURS, ROW_H, START_HOUR, STATUS_COLORS, isSameDay, cardS } from './agenda-constants';

interface Props {
  currentDate: Date;
  agendamentos: Agendamento[];
  profissionais: Profissional[];
  now: Date;
  gridRef: React.RefObject<HTMLDivElement | null>;
  openNewModal: (date?: Date, hour?: string, profissionalId?: string, endHour?: string) => void;
  openEditModal: (ag: Agendamento) => void;
  reschedule?: (id: string, newStart: Date, newEnd: Date) => void;
}

const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Status color mapping — solid colored blocks matching reference grid style
const STATUS_BLOCK: Record<string, { bg: string; borderColor: string; dotColor: string; textColor: string }> = {
  pendente:       { bg: '#e8f4fd', borderColor: '#60a5fa', dotColor: '#3b82f6', textColor: '#1e3a5f' },
  confirmado:     { bg: '#d1fae5', borderColor: '#34d399', dotColor: '#10b981', textColor: '#064e3b' },
  em_atendimento: { bg: '#ede9fe', borderColor: '#8b5cf6', dotColor: '#6366f1', textColor: '#3b0764' },
  finalizado:     { bg: '#dcfce7', borderColor: '#22c55e', dotColor: '#16a34a', textColor: '#14532d' },
  falta:          { bg: '#fee2e2', borderColor: '#f87171', dotColor: '#ef4444', textColor: '#7f1d1d' },
  cancelado:      { bg: '#e5e7eb', borderColor: '#9ca3af', dotColor: '#6b7280', textColor: '#374151' },
  ausente:        { bg: '#f3f4f6', borderColor: '#d1d5db', dotColor: '#9ca3af', textColor: '#6b7280' },
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

  // ── Drag-to-select time range ──
  const [selection, setSelection] = useState<{ colId: string; startIdx: number; endIdx: number } | null>(null);
  const isDragging = useRef(false);
  const dragCol = useRef('');
  const dragStart = useRef(0);

  const handleCellMouseDown = useCallback((colId: string, hourIdx: number, isFaltaCol: boolean) => {
    if (isFaltaCol) return;
    isDragging.current = true;
    dragCol.current = colId;
    dragStart.current = hourIdx;
    setSelection({ colId, startIdx: hourIdx, endIdx: hourIdx });
  }, []);

  const handleCellMouseEnter = useCallback((colId: string, hourIdx: number) => {
    if (!isDragging.current || colId !== dragCol.current) return;
    setSelection(prev => prev ? { ...prev, endIdx: hourIdx } : null);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setSelection(prev => {
        if (!prev) return null;
        const startIdx = Math.min(prev.startIdx, prev.endIdx);
        const endIdx = Math.max(prev.startIdx, prev.endIdx);
        const startHour = HOURS[startIdx];
        const endSlotIdx = Math.min(endIdx + 1, HOURS.length - 1);
        const endHour = HOURS[endSlotIdx] || HOURS[HOURS.length - 1];
        // setTimeout to avoid state update conflicts
        setTimeout(() => openNewModal(currentDate, startHour, prev.colId, endHour), 0);
        return null;
      });
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [currentDate, openNewModal]);

  const isCellSelected = (colId: string, hourIdx: number) => {
    if (!selection || selection.colId !== colId) return false;
    const lo = Math.min(selection.startIdx, selection.endIdx);
    const hi = Math.max(selection.startIdx, selection.endIdx);
    return hourIdx >= lo && hourIdx <= hi;
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
                {HOURS.map((h, i) => {
                  const selected = isCellSelected(prof.id, i);
                  return (
                    <div key={h}
                      onMouseDown={() => handleCellMouseDown(prof.id, i, isFaltaCol)}
                      onMouseEnter={() => handleCellMouseEnter(prof.id, i)}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, h)}
                      style={{
                        height: ROW_H,
                        borderTop: i > 0 ? `1px ${h.endsWith(':30') ? 'dashed' : 'solid'} var(--border)` : 'none',
                        cursor: isFaltaCol ? 'default' : 'crosshair', transition: 'background 0.05s',
                        background: selected ? 'rgba(230,0,126,0.12)' : 'transparent',
                        borderLeft: selected ? '3px solid var(--primary)' : 'none',
                      }}
                      onMouseOver={e => {
                        if (!isDragging.current && !isFaltaCol) e.currentTarget.style.background = 'rgba(230,0,126,0.03)';
                      }}
                      onMouseOut={e => {
                        if (!isDragging.current && !selected) e.currentTarget.style.background = 'transparent';
                      }}
                    />
                  );
                })}
                {/* Absence blocks (from weekly schedule) */}
                {(() => {
                  if (isFaltaCol || !prof.absenceSchedule) return null;
                  const dayOfWeek = String(currentDate.getDay()); // 0=Sun, 1=Mon, ...
                  const slots = (prof.absenceSchedule as Record<string, { start: string; end: string }[]>)?.[dayOfWeek] || [];
                  return slots.filter(s => s.start && s.end).map((slot, si) => {
                    const [sh, sm] = slot.start.split(':').map(Number);
                    const [eh, em] = slot.end.split(':').map(Number);
                    const startMin = sh * 60 + sm;
                    const endMin = eh * 60 + em;
                    if (endMin <= startMin) return null;
                    const top = ((startMin - START_HOUR * 60) / 30) * ROW_H;
                    const height = ((endMin - startMin) / 30) * ROW_H;
                    return (
                      <div key={`abs-${si}`} style={{
                        position: 'absolute', top, left: 0, right: 0, height,
                        background: 'rgba(156,163,175,0.45)',
                        zIndex: 1, display: 'flex', flexDirection: 'column',
                        padding: '4px 8px', pointerEvents: 'none',
                      }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280' }}>
                          {slot.start} - {slot.end}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af' }}>Ausente</span>
                      </div>
                    );
                  });
                })()}

                {/* Appointment blocks */}
                {colAgendamentos.map(ag => {
                  const startD = new Date(ag.startTime);
                  const endD = new Date(ag.endTime);
                  const startMin = startD.getHours() * 60 + startD.getMinutes();
                  const endMin = endD.getHours() * 60 + endD.getMinutes();
                  const top = ((startMin - START_HOUR * 60) / 30) * ROW_H;
                  const height = Math.max(ROW_H * 0.8, ((endMin - startMin) / 30) * ROW_H - 1);
                  const sc = STATUS_BLOCK[ag.status] || STATUS_BLOCK.pendente;
                  const isNow = now >= startD && now <= endD && isSameDay(currentDate, today);
                  // Get professional initial for the prefix
                  const prof = profissionais.find(p => p.id === ag.profissionalId);
                  const profInitial = prof ? prof.name.charAt(0).toUpperCase() : '';

                  return (
                    <div key={ag.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, ag)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openEditModal(ag)}
                      style={{
                        position: 'absolute', top, left: 1, right: 1, height,
                        background: sc.bg,
                        borderLeft: `4px solid ${sc.borderColor}`,
                        borderRadius: 2, padding: '3px 6px', cursor: 'grab',
                        overflow: 'hidden', fontSize: '0.7rem', zIndex: 2,
                        transition: 'all 0.12s',
                        boxShadow: isNow ? `0 0 0 2px ${sc.borderColor}` : 'none',
                        border: `1px solid ${sc.borderColor}33`,
                        borderLeftWidth: 4, borderLeftColor: sc.borderColor, borderLeftStyle: 'solid',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1.01)'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      {/* Status dot + time */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: sc.dotColor, flexShrink: 0 }} />
                        <span style={{ fontWeight: 900, color: sc.textColor, fontSize: '0.7rem' }}>
                          {fmtTime(startD)} - {fmtTime(endD)}
                        </span>
                        {/* Icons */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, flexShrink: 0 }}>
                          {ag.clientPhone && (
                            <span style={{ fontSize: '0.58rem' }} title="WhatsApp">💬</span>
                          )}
                          {ag.sessionNumber && ag.totalSessions && (
                            <span style={{
                              fontSize: '0.56rem', fontWeight: 900, padding: '0 3px', borderRadius: 2,
                              background: sc.borderColor + '22', color: sc.textColor,
                            }}>
                              S
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Client name with professional prefix */}
                      <div style={{
                        fontWeight: 800, color: sc.textColor, marginTop: 1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontSize: '0.72rem', lineHeight: 1.3,
                      }}>
                        {profInitial && <span style={{ opacity: 0.6 }}>({profInitial}) </span>}
                        {ag.clientName}
                        {ag.sessionNumber && ag.totalSessions && (
                          <span style={{ fontWeight: 600, fontSize: '0.63rem', opacity: 0.7 }}>
                            {' '}({ag.sessionNumber}/{ag.totalSessions})
                          </span>
                        )}
                      </div>
                      {/* Procedure */}
                      {height > 44 && (
                        <div style={{
                          color: sc.textColor, fontSize: '0.65rem', fontWeight: 600, marginTop: 1,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.7,
                        }}>
                          {ag.procedimento}
                        </div>
                      )}
                      {/* Sala */}
                      {height > 60 && ag.sala && (
                        <div style={{ color: sc.textColor, fontSize: '0.6rem', fontWeight: 600, marginTop: 1, opacity: 0.6 }}>
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
