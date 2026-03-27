import React from 'react';

/* ──────────── Types ──────────── */
export interface Profissional { id: string; name: string; unit: string; color: string; isActive: boolean; }
export interface Agendamento {
  id: string; clientName: string; clientPhone?: string; procedimento: string;
  profissionalId: string; unit: string; startTime: string; endTime: string;
  status: string; sala?: string; sessionNumber?: number; totalSessions?: number;
  notes?: string; profissional: Profissional;
}

export interface AgendaForm {
  clientName: string; clientPhone: string; procedimento: string; profissionalId: string;
  startDate: string; startHour: string; startMin: string; endHour: string; endMin: string;
  status: string; sala: string; sessionNumber: string; totalSessions: string; notes: string; unit: string;
}

export interface ProfForm { name: string; color: string; unit: string; }

/* ──────────── Constants ──────────── */
export const HOURS = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 7;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

export const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  pendente: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#92400e', label: 'Pendente' },
  confirmado: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#065f46', label: 'Confirmado' },
  em_atendimento: { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', text: '#1e40af', label: 'Em Atendimento' },
  finalizado: { bg: 'rgba(107,114,128,0.10)', border: '#6b7280', text: '#374151', label: 'Finalizado' },
  falta: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#991b1b', label: 'Falta' },
  cancelado: { bg: 'rgba(156,163,175,0.12)', border: '#9ca3af', text: '#6b7280', label: 'Cancelado' },
};

export const ROW_H = 48;
export const START_HOUR = 7;

/* ──────────── Date Helpers ──────────── */
export function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function isSameDay(a: Date, b: Date) { return dateKey(a) === dateKey(b); }
export function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
export function endOfWeek(d: Date) { return addDays(startOfWeek(d), 6); }

export function getWeekDays(d: Date) {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(start, i));
  return days;
}

export function timeToMinutes(timeStr: string) {
  const d = new Date(timeStr);
  return d.getHours() * 60 + d.getMinutes();
}

/* ──────────── Shared Styles ──────────── */
export const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };
export const btnPrimary: React.CSSProperties = { background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', border: 'none', borderRadius: 12, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s', fontFamily: 'inherit' };
export const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.88rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s' };
export const selectS: React.CSSProperties = { ...inputS, cursor: 'pointer' };

/* ──────────── Appointment Card ──────────── */
export function renderAppointmentCard(ag: Agendamento, openEdit: (ag: Agendamento) => void, colWidth?: number) {
  const st = STATUS_COLORS[ag.status] || STATUS_COLORS.pendente;
  const startMin = timeToMinutes(ag.startTime);
  const endMin = timeToMinutes(ag.endTime);
  const top = ((startMin - START_HOUR * 60) / 30) * ROW_H;
  const height = Math.max(ROW_H * 0.8, ((endMin - startMin) / 30) * ROW_H - 2);
  const sTime = new Date(ag.startTime);
  const eTime = new Date(ag.endTime);
  const timeStr = `${String(sTime.getHours()).padStart(2, '0')}:${String(sTime.getMinutes()).padStart(2, '0')} - ${String(eTime.getHours()).padStart(2, '0')}:${String(eTime.getMinutes()).padStart(2, '0')}`;

  return (
    <div key={ag.id}
      onClick={() => openEdit(ag)}
      style={{
        position: 'absolute', top, left: 2, right: 2, height, minHeight: 32,
        background: st.bg, borderLeft: `4px solid ${st.border}`, borderRadius: 8,
        padding: '4px 8px', cursor: 'pointer', overflow: 'hidden', fontSize: '0.72rem',
        transition: 'all 0.2s', zIndex: 2,
        ...(colWidth && colWidth < 120 ? { fontSize: '0.65rem', padding: '2px 4px' } : {}),
      }}
    >
      <div style={{ fontWeight: 800, color: st.text, lineHeight: 1.2 }}>{timeStr}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {ag.clientName}
        {ag.sessionNumber && ag.totalSessions && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}> ({ag.sessionNumber}/{ag.totalSessions})</span>}
      </div>
      {height > 40 && <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ag.procedimento}</div>}
    </div>
  );
}
