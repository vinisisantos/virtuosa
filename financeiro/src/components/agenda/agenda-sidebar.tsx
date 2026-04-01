import React, { useState, useEffect } from 'react';
import type { Agendamento, Profissional, AgendaForm } from './agenda-constants';
import { MONTHS_PT, DAYS_PT, STATUS_COLORS, getMonthDays, isSameDay, dateKey, cardS, btnPrimary, inputS, selectS } from './agenda-constants';

interface Props {
  currentDate: Date;
  agendamentos: Agendamento[];
  profissionais: Profissional[];
  view: 'list' | 'day' | 'week' | 'month';
  setView: (v: 'list' | 'day' | 'week' | 'month') => void;
  setCurrentDate: (d: Date) => void;
  canMultiUnit: boolean;
  filterUnit: string; setFilterUnit: (v: string) => void;
  filterProf: string; setFilterProf: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  filterProced: string; setFilterProced: (v: string) => void;
  clearFilters: () => void;
  showProfModal: boolean; setShowProfModal: (v: boolean) => void;
  profForm: { name: string; color: string; unit: string };
  setProfForm: (f: { name: string; color: string; unit: string }) => void;
  goPrev: () => void; goNext: () => void; goToday: () => void;
}

interface Reminder { id: string; clientName: string; procedimento: string; profissional: string; startTime: string; hoursUntil: number; whatsappLink: string | null; }

export function AgendaSidebar({ currentDate, agendamentos, profissionais, view, setView, setCurrentDate, canMultiUnit, filterUnit, setFilterUnit, filterProf, setFilterProf, filterStatus, setFilterStatus, filterProced, setFilterProced, clearFilters, setShowProfModal, profForm, setProfForm, goPrev, goNext, goToday }: Props) {
  const today = new Date();

  // Independent mini-calendar month navigation
  const [calMonth, setCalMonth] = useState(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  const [monthAppts, setMonthAppts] = useState<{ date: string; count: number }[]>([]);

  // Sync calMonth when currentDate changes
  useEffect(() => {
    setCalMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  // Fetch all appointments for the displayed calendar month (for dots)
  useEffect(() => {
    const start = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const end = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0, 23, 59, 59);
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    if (filterUnit) params.set('unit', filterUnit);
    fetch(`/api/agenda?${params}`)
      .then(r => r.json())
      .then((data: any[]) => {
        const map: Record<string, number> = {};
        (data || []).forEach((a: any) => {
          const key = new Date(a.startTime).toISOString().split('T')[0];
          map[key] = (map[key] || 0) + 1;
        });
        setMonthAppts(Object.entries(map).map(([date, count]) => ({ date, count })));
      })
      .catch(() => {});
  }, [calMonth, filterUnit]);

  const calPrevMonth = () => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1));
  const calNextMonth = () => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1));

  const miniCalDays = getMonthDays(calMonth.getFullYear(), calMonth.getMonth());

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showReminders, setShowReminders] = useState(false);
  const [loadingReminders, setLoadingReminders] = useState(false);

  const loadReminders = async () => {
    setLoadingReminders(true);
    try {
      const res = await fetch('/api/reminders');
      const data = await res.json();
      setReminders(data.reminders || []);
      setShowReminders(true);
    } catch { /* ignore */ }
    finally { setLoadingReminders(false); }
  };

  const sendAllReminders = async () => {
    await fetch('/api/reminders', { method: 'POST' });
    for (const r of reminders) {
      if (r.whatsappLink) window.open(r.whatsappLink, '_blank');
    }
  };

  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      {/* Navigation */}
      <div style={{ ...cardS, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button onClick={calPrevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>chevron_left</span>
          </button>
          <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{MONTHS_PT[calMonth.getMonth()].slice(0, 3)} {calMonth.getFullYear()}</span>
          <button onClick={calNextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>chevron_right</span>
          </button>
        </div>
        <button onClick={goToday} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginBottom: 12, padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>today</span> Hoje
        </button>
        {/* Mini calendar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, fontSize: '0.7rem', textAlign: 'center' }}>
          {DAYS_PT.map(d => <div key={d} style={{ fontWeight: 800, color: 'var(--text-muted)', padding: '4px 0', fontSize: '0.65rem' }}>{d[0]}</div>)}
          {miniCalDays.map((d, i) => {
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, currentDate);
            const isCurrentMonth = d.getMonth() === calMonth.getMonth();
            const dayKey = d.toISOString().split('T')[0];
            const apptInfo = monthAppts.find(a => a.date === dayKey);
            const hasAppts = !!apptInfo;
            return (
              <div key={i} onClick={() => { setCurrentDate(d); if (view === 'month') setView('day'); }}
                style={{
                  padding: '4px 0', borderRadius: 8, cursor: 'pointer', fontWeight: isToday || isSelected ? 800 : 500,
                  background: isSelected ? 'var(--primary)' : isToday ? 'rgba(230,0,126,0.1)' : 'transparent',
                  color: isSelected ? '#fff' : !isCurrentMonth ? 'var(--text-muted)' : isToday ? 'var(--primary)' : 'var(--text-main)',
                  position: 'relative', transition: 'all 0.15s',
                }}
                title={hasAppts ? `${apptInfo!.count} agendamento(s)` : ''}
              >
                {d.getDate()}
                {hasAppts && <div style={{ width: 4, height: 4, borderRadius: 2, background: isSelected ? '#fff' : 'var(--primary)', margin: '1px auto 0' }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...cardS, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Filtros</span>
          <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>Limpar filtros</button>
        </div>


        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Profissional</label>
          <select value={filterProf} onChange={e => setFilterProf(e.target.value)} style={{ ...selectS, padding: '12px 14px', fontSize: '0.88rem' }}>
            <option value="">Todos</option>
            {profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectS, padding: '12px 14px', fontSize: '0.88rem' }}>
            <option value="">Todos</option>
            {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Procedimento</label>
          <input value={filterProced} onChange={e => setFilterProced(e.target.value)} placeholder="Filtrar..." style={{ ...inputS, padding: '12px 14px', fontSize: '0.88rem' }} />
        </div>
      </div>

      {/* Reminders */}
      <div style={{ ...cardS, padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>notifications_active</span>
          <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Lembretes</span>
        </div>
        <button onClick={loadReminders} disabled={loadingReminders} style={{
          ...btnPrimary, width: '100%', justifyContent: 'center', padding: '8px 12px', borderRadius: 10, fontSize: '0.78rem',
          background: 'linear-gradient(135deg, #f59e0b, #eab308)', opacity: loadingReminders ? 0.7 : 1,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{loadingReminders ? 'progress_activity' : 'schedule_send'}</span>
          {loadingReminders ? 'Verificando...' : 'Ver próximas 24h'}
        </button>

        {showReminders && (
          <div style={{ marginTop: 10 }}>
            {reminders.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Nenhum agendamento nas próximas 24h</div>
            ) : (
              <>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>{reminders.length} agendamento(s)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {reminders.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, background: 'var(--bg)', fontSize: '0.72rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.clientName}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>em {r.hoursUntil}h • {r.procedimento}</div>
                      </div>
                      {r.whatsappLink && (
                        <a href={r.whatsappLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '1rem', textDecoration: 'none' }}>💬</a>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={sendAllReminders} style={{
                  ...btnPrimary, width: '100%', justifyContent: 'center', padding: '6px 10px', borderRadius: 8, fontSize: '0.72rem', marginTop: 8,
                  background: '#25d366',
                }}>
                  <span style={{ marginRight: 4 }}>💬</span> Enviar Todos via WhatsApp
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Professionals */}
      <div style={{ ...cardS, padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>Profissionais</span>
          <button onClick={() => { setProfForm({ name: '', color: '#e600a0', unit: filterUnit || 'Barueri' }); setShowProfModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>add_circle</span>
          </button>
        </div>
        {profissionais.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: '0.82rem' }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: p.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{p.name}</span>
          </div>
        ))}
        {profissionais.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Nenhum profissional cadastrado</div>}
      </div>

      {/* Legend */}
      <div style={{ ...cardS, padding: 16, marginTop: 16 }}>
        <span style={{ fontWeight: 800, fontSize: '0.82rem', display: 'block', marginBottom: 8 }}>Legenda</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: v.border, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
