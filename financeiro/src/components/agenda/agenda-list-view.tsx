import React, { useState } from 'react';
import type { Agendamento, Profissional } from './agenda-constants';
import { STATUS_COLORS, cardS, btnPrimary, isSameDay } from './agenda-constants';

interface Props {
  currentDate: Date;
  agendamentos: Agendamento[];
  profissionais: Profissional[];
  now: Date;
  openNewModal: (date?: Date, hour?: string) => void;
  openEditModal: (ag: Agendamento) => void;
}

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAYS_PT_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function AgendaListView({ currentDate, agendamentos, profissionais, now, openNewModal, openEditModal }: Props) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Group agendamentos by day
  const grouped: Record<string, Agendamento[]> = {};
  agendamentos.forEach(ag => {
    const key = new Date(ag.startTime).toISOString().split('T')[0];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ag);
  });

  // Sort days
  const sortedDays = Object.keys(grouped).sort();

  // Sort agendamentos within each day
  sortedDays.forEach(day => {
    grouped[day].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  });

  const getProfColor = (profId: string) => {
    const p = profissionais.find(pr => pr.id === profId);
    return p?.color || '#6366f1';
  };

  const getProfName = (ag: Agendamento) => {
    if (ag.profissional?.name) return ag.profissional.name;
    const p = profissionais.find(pr => pr.id === ag.profissionalId);
    return p?.name || 'Profissional';
  };

  const isToday = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return isSameDay(d, now);
  };

  const isPast = (dateStr: string) => {
    const d = new Date(dateStr + 'T23:59:59');
    return d < now && !isToday(dateStr);
  };

  const statusConfig = (status: string) => STATUS_COLORS[status] || { bg: '#f5f5f5', border: '#999', label: status };

  if (agendamentos.length === 0) {
    return (
      <div style={{ ...cardS, padding: 60, textAlign: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 64, color: 'var(--text-muted)', opacity: 0.3 }}>event_busy</span>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-muted)', marginTop: 16 }}>Nenhum agendamento encontrado</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', opacity: 0.7, marginTop: 8 }}>Clique no botão "Novo Agendamento" para criar um.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Summary bar */}
      <div style={{ ...cardS, padding: '14px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>calendar_month</span>
          <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{agendamentos.length} agendamento{agendamentos.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ height: 16, width: 1, background: 'var(--border)' }} />
        {Object.entries(STATUS_COLORS).map(([key, val]) => {
          const count = agendamentos.filter(a => a.status === key).length;
          if (count === 0) return null;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: 3, background: val.border }} />
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{val.label}: {count}</span>
            </div>
          );
        })}
      </div>

      {/* Day groups */}
      {sortedDays.map(dayStr => {
        const dayDate = new Date(dayStr + 'T12:00:00');
        const dayAppts = grouped[dayStr];
        const todayFlag = isToday(dayStr);
        const pastFlag = isPast(dayStr);
        const isExpanded = expandedDay === dayStr || expandedDay === null;

        return (
          <div key={dayStr} style={{ ...cardS, overflow: 'hidden', opacity: pastFlag ? 0.6 : 1 }}>
            {/* Day header */}
            <div
              onClick={() => setExpandedDay(expandedDay === dayStr ? null : dayStr)}
              style={{
                padding: '12px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: todayFlag ? 'rgba(230,0,126,0.06)' : 'transparent',
                borderLeft: todayFlag ? '4px solid var(--primary)' : '4px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'center', minWidth: 40 }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1, color: todayFlag ? 'var(--primary)' : 'var(--text-main)' }}>
                    {dayDate.getDate()}
                  </div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {MONTHS_PT[dayDate.getMonth()].slice(0, 3)}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {DAYS_PT_FULL[dayDate.getDay()]}
                    {todayFlag && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: 'var(--primary)', color: '#fff' }}>HOJE</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
                    {dayAppts.length} agendamento{dayAppts.length !== 1 ? 's' : ''}
                    {' • '}
                    {fmtTime(new Date(dayAppts[0].startTime))} – {fmtTime(new Date(dayAppts[dayAppts.length - 1].endTime))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Mini status dots */}
                <div style={{ display: 'flex', gap: 3 }}>
                  {dayAppts.map((a, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: statusConfig(a.status).border }} />
                  ))}
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  expand_more
                </span>
              </div>
            </div>

            {/* Appointments list */}
            {isExpanded && (
              <div style={{ padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayAppts.map(ag => {
                  const start = new Date(ag.startTime);
                  const end = new Date(ag.endTime);
                  const durMin = Math.round((end.getTime() - start.getTime()) / 60000);
                  const sc = statusConfig(ag.status);
                  const profColor = getProfColor(ag.profissionalId);
                  const profName = getProfName(ag);
                  const isNow = now >= start && now <= end;

                  return (
                    <div
                      key={ag.id}
                      onClick={() => openEditModal(ag)}
                      style={{
                        display: 'flex', alignItems: 'stretch', gap: 0, cursor: 'pointer',
                        borderRadius: 12, overflow: 'hidden', transition: 'all 0.15s',
                        background: isNow ? 'rgba(230,0,126,0.04)' : 'var(--bg)',
                        border: `1px solid ${isNow ? 'var(--primary)' : 'var(--border)'}`,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      {/* Color strip */}
                      <div style={{ width: 5, background: profColor, flexShrink: 0 }} />

                      {/* Time column */}
                      <div style={{ padding: '12px 16px', minWidth: 90, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                          {fmtTime(start)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {fmtTime(end)} • {durMin}min
                        </div>
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, padding: '10px 16px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ag.clientName}
                          </span>
                          {isNow && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'var(--primary)', color: '#fff', flexShrink: 0, animation: 'pulse 2s infinite' }}>
                              EM ATENDIMENTO
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{ag.procedimento}</span>
                          {ag.sessionNumber && ag.totalSessions && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
                              Sessão {ag.sessionNumber}/{ag.totalSessions}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right info */}
                      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        {/* Profissional */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 4, background: profColor }} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {profName}
                          </span>
                        </div>
                        {/* Status badge */}
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                          background: sc.bg, color: sc.border, border: `1px solid ${sc.border}`,
                          textTransform: 'uppercase', letterSpacing: '0.03em',
                        }}>
                          {sc.label}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Add button for this day */}
                <button
                  onClick={e => { e.stopPropagation(); openNewModal(dayDate); }}
                  style={{
                    border: '1px dashed var(--border)', borderRadius: 10, padding: '8px 16px',
                    background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.78rem',
                    fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Agendar para este dia
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
