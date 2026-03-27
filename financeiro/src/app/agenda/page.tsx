'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/app-header';

/* ──────────── Types ──────────── */
interface Profissional { id: string; name: string; unit: string; color: string; isActive: boolean; }
interface Agendamento {
  id: string; clientName: string; clientPhone?: string; procedimento: string;
  profissionalId: string; unit: string; startTime: string; endTime: string;
  status: string; sala?: string; sessionNumber?: number; totalSessions?: number;
  notes?: string; profissional: Profissional;
}

/* ──────────── Helpers ──────────── */
const HOURS = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 7;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  pendente: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#92400e', label: 'Pendente' },
  confirmado: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#065f46', label: 'Confirmado' },
  em_atendimento: { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', text: '#1e40af', label: 'Em Atendimento' },
  finalizado: { bg: 'rgba(107,114,128,0.10)', border: '#6b7280', text: '#374151', label: 'Finalizado' },
  falta: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#991b1b', label: 'Falta' },
  cancelado: { bg: 'rgba(156,163,175,0.12)', border: '#9ca3af', text: '#6b7280', label: 'Cancelado' },
};

function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function isSameDay(a: Date, b: Date) { return dateKey(a) === dateKey(b); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
function endOfWeek(d: Date) { return addDays(startOfWeek(d), 6); }

function getWeekDays(d: Date) {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(start, i));
  return days;
}

function timeToMinutes(timeStr: string) {
  const d = new Date(timeStr);
  return d.getHours() * 60 + d.getMinutes();
}

/* ──────────── Component ──────────── */
export default function AgendaPage() {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ clientName: '', clientPhone: '', procedimento: '', profissionalId: '', startDate: '', startHour: '09', startMin: '00', endHour: '10', endMin: '00', status: 'pendente', sala: '', sessionNumber: '', totalSessions: '', notes: '', unit: 'Barueri' });
  const [filterProf, setFilterProf] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProced, setFilterProced] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [search, setSearch] = useState('');
  const [showProfModal, setShowProfModal] = useState(false);
  const [profForm, setProfForm] = useState({ name: '', color: '#e600a0', unit: 'Barueri' });
  const [now, setNow] = useState(new Date());
  const [canMultiUnit, setCanMultiUnit] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load unit and permissions from user
  useEffect(() => {
    const raw = localStorage.getItem('virtuosa_user');
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u.unit) setFilterUnit(u.unit);
        const perms = u.permissions || {};
        const isAdmin = perms.admin === true || u.role === 'ADMINISTRADOR';
        setCanMultiUnit(isAdmin || perms.multiUnit === true);
      } catch { /* */ }
    }
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    let start: string, end: string;
    if (view === 'day') {
      start = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).toISOString();
      end = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59).toISOString();
    } else if (view === 'week') {
      const sw = startOfWeek(currentDate);
      start = new Date(sw.getFullYear(), sw.getMonth(), sw.getDate()).toISOString();
      end = new Date(sw.getFullYear(), sw.getMonth(), sw.getDate() + 6, 23, 59, 59).toISOString();
    } else {
      start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();
    }
    const params = new URLSearchParams({ start, end });
    if (filterUnit) params.set('unit', filterUnit);
    if (filterProf) params.set('profissionalId', filterProf);
    if (filterStatus) params.set('status', filterStatus);
    if (filterProced) params.set('procedimento', filterProced);
    if (search) params.set('search', search);

    const [agRes, prRes] = await Promise.all([
      fetch(`/api/agenda?${params}`),
      fetch(`/api/profissionais${filterUnit ? `?unit=${filterUnit}` : ''}`),
    ]);
    setAgendamentos(await agRes.json());
    setProfissionais(await prRes.json());
  }, [view, currentDate, filterUnit, filterProf, filterStatus, filterProced, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scroll to current hour on mount
  useEffect(() => {
    if (gridRef.current && (view === 'day' || view === 'week')) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const scrollPos = Math.max(0, ((nowMinutes - 7 * 60) / 30) * 48 - 200);
      gridRef.current.scrollTop = scrollPos;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Navigation
  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (view === 'day') setCurrentDate(addDays(currentDate, -1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const goNext = () => {
    if (view === 'day') setCurrentDate(addDays(currentDate, 1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // CRUD
  const openNewModal = (date?: Date, hour?: string) => {
    const d = date || currentDate;
    const h = hour?.split(':')[0] || '09';
    const m = hour?.split(':')[1] || '00';
    const endH = String(Math.min(23, parseInt(h) + 1)).padStart(2, '0');
    setForm({ clientName: '', clientPhone: '', procedimento: '', profissionalId: profissionais[0]?.id || '', startDate: dateKey(d), startHour: h, startMin: m, endHour: endH, endMin: m, status: 'pendente', sala: '', sessionNumber: '', totalSessions: '', notes: '', unit: filterUnit || 'Barueri' });
    setEditingId(null);
    setShowModal(true);
  };

  const openEditModal = (ag: Agendamento) => {
    const s = new Date(ag.startTime);
    const e = new Date(ag.endTime);
    setForm({
      clientName: ag.clientName, clientPhone: ag.clientPhone || '', procedimento: ag.procedimento,
      profissionalId: ag.profissionalId, startDate: dateKey(s),
      startHour: String(s.getHours()).padStart(2, '0'), startMin: String(s.getMinutes()).padStart(2, '0'),
      endHour: String(e.getHours()).padStart(2, '0'), endMin: String(e.getMinutes()).padStart(2, '0'),
      status: ag.status, sala: ag.sala || '', sessionNumber: ag.sessionNumber?.toString() || '',
      totalSessions: ag.totalSessions?.toString() || '', notes: ag.notes || '', unit: ag.unit,
    });
    setEditingId(ag.id);
    setShowModal(true);
  };

  const saveAgendamento = async () => {
    const startTime = new Date(`${form.startDate}T${form.startHour}:${form.startMin}:00`).toISOString();
    const endTime = new Date(`${form.startDate}T${form.endHour}:${form.endMin}:00`).toISOString();
    const body = {
      ...(editingId && { id: editingId }),
      clientName: form.clientName, clientPhone: form.clientPhone || null,
      procedimento: form.procedimento, profissionalId: form.profissionalId,
      unit: form.unit, startTime, endTime, status: form.status, sala: form.sala || null,
      sessionNumber: form.sessionNumber ? parseInt(form.sessionNumber) : null,
      totalSessions: form.totalSessions ? parseInt(form.totalSessions) : null,
      notes: form.notes || null,
    };
    await fetch('/api/agenda', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setShowModal(false);
    fetchData();
  };

  const deleteAgendamento = async (id: string) => {
    if (!confirm('Excluir este agendamento?')) return;
    await fetch(`/api/agenda?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const saveProfissional = async () => {
    await fetch('/api/profissionais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profForm) });
    setProfForm({ name: '', color: '#e600a0', unit: filterUnit || 'Barueri' });
    setShowProfModal(false);
    fetchData();
  };

  // Styles
  const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };
  const btnPrimary: React.CSSProperties = { background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', border: 'none', borderRadius: 12, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s', fontFamily: 'inherit' };
  const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.88rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s' };
  const selectS: React.CSSProperties = { ...inputS, cursor: 'pointer' };

  // View label
  const viewLabel = () => {
    if (view === 'day') return `${currentDate.getDate()} de ${MONTHS_PT[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
    if (view === 'week') {
      const sw = startOfWeek(currentDate);
      const ew = endOfWeek(currentDate);
      return `${sw.getDate()} – ${ew.getDate()} de ${MONTHS_PT[ew.getMonth()].slice(0, 3).toLowerCase()}. ${ew.getFullYear()}`;
    }
    return `${MONTHS_PT[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  // Mini calendar
  const miniCalDays = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
  const today = new Date();

  // Time slots grid
  const ROW_H = 48;
  const START_HOUR = 7;

  const renderAppointmentCard = (ag: Agendamento, colWidth?: number) => {
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
        onClick={() => openEditModal(ag)}
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
  };

  // Current time line
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - START_HOUR * 60) / 30) * ROW_H;
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= 21 * 60;

  return (
    <>
      <AppHeader activePage="agenda" />
      <main style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>calendar_month</span>
              Agenda
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-muted)' }}>search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." style={{ ...inputS, width: 200, paddingLeft: 34, fontSize: '0.82rem' }} />
            </div>
            {/* View toggle */}
            <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['day', 'week', 'month'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: '8px 16px', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                  background: view === v ? 'var(--primary)' : 'transparent', color: view === v ? '#fff' : 'var(--text-muted)',
                }}>
                  {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Sidebar */}
          <div style={{ width: 240, flexShrink: 0 }}>
            {/* Navigation */}
            <div style={{ ...cardS, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <button onClick={goPrev} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>chevron_left</span>
                </button>
                <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{MONTHS_PT[currentDate.getMonth()].slice(0, 3)} {currentDate.getFullYear()}</span>
                <button onClick={goNext} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
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
                  const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                  const hasAppts = agendamentos.some(a => isSameDay(new Date(a.startTime), d));
                  return (
                    <div key={i} onClick={() => { setCurrentDate(d); if (view === 'month') setView('day'); }}
                      style={{
                        padding: '4px 0', borderRadius: 8, cursor: 'pointer', fontWeight: isToday || isSelected ? 800 : 500,
                        background: isSelected ? 'var(--primary)' : isToday ? 'rgba(230,0,126,0.1)' : 'transparent',
                        color: isSelected ? '#fff' : !isCurrentMonth ? 'var(--text-muted)' : isToday ? 'var(--primary)' : 'var(--text-main)',
                        position: 'relative', transition: 'all 0.15s',
                      }}
                    >
                      {d.getDate()}
                      {hasAppts && !isSelected && <div style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--primary)', margin: '1px auto 0' }} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filters */}
            <div style={{ ...cardS, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>Filtros</span>
                <button onClick={() => { setFilterProf(''); setFilterStatus(''); setFilterProced(''); setSearch(''); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Limpar filtros</button>
              </div>
              {canMultiUnit && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Unidade</label>
                <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={{ ...selectS, padding: '8px 10px', fontSize: '0.82rem' }}>
                  <option value="">Todas</option>
                  {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Profissional</label>
                <select value={filterProf} onChange={e => setFilterProf(e.target.value)} style={{ ...selectS, padding: '8px 10px', fontSize: '0.82rem' }}>
                  <option value="">Todos</option>
                  {profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectS, padding: '8px 10px', fontSize: '0.82rem' }}>
                  <option value="">Todos</option>
                  {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Procedimento</label>
                <input value={filterProced} onChange={e => setFilterProced(e.target.value)} placeholder="Filtrar..." style={{ ...inputS, padding: '8px 10px', fontSize: '0.82rem' }} />
              </div>
            </div>

            {/* Professionals management */}
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

            {/* Status legend */}
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

          {/* Main calendar area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Date header */}
            <div style={{ ...cardS, padding: '12px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={goPrev} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>chevron_left</span>
                </button>
                <span style={{ fontWeight: 800, fontSize: '1rem' }}>{viewLabel()}</span>
                <button onClick={goNext} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>chevron_right</span>
                </button>
              </div>
              <button onClick={() => openNewModal()} style={btnPrimary}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Novo Agendamento
              </button>
            </div>

            {/* DAY VIEW */}
            {view === 'day' && (
              <div style={{ ...cardS, overflow: 'hidden' }}>
                {/* Professional headers */}
                <div style={{ display: 'grid', gridTemplateColumns: `60px ${profissionais.length ? profissionais.map(() => '1fr').join(' ') : '1fr'}`, borderBottom: '2px solid var(--border)' }}>
                  <div style={{ padding: '12px 8px', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Hora</div>
                  {profissionais.length > 0 ? profissionais.map(p => (
                    <div key={p.id} style={{ padding: '10px 12px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{p.name}</div>
                      <div style={{ width: 20, height: 3, borderRadius: 2, background: p.color, margin: '4px auto 0' }} />
                    </div>
                  )) : (
                    <div style={{ padding: '10px 12px', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 800, fontSize: '0.85rem' }}>Todos</div>
                  )}
                </div>
                {/* Time grid */}
                <div ref={gridRef} style={{ position: 'relative', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: `60px ${profissionais.length ? profissionais.map(() => '1fr').join(' ') : '1fr'}`, position: 'relative' }}>
                    {/* Time labels */}
                    <div style={{ position: 'relative' }}>
                      {HOURS.map((h, i) => (
                        <div key={h} style={{ height: ROW_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8, paddingTop: 2, fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', borderTop: i > 0 ? '1px solid var(--border)' : 'none', opacity: h.endsWith(':30') ? 0.5 : 1 }}>
                          {h}
                        </div>
                      ))}
                    </div>
                    {/* Columns */}
                    {(profissionais.length > 0 ? profissionais : [{ id: 'all', name: 'Todos', color: '#e600a0' } as Profissional]).map(prof => (
                      <div key={prof.id} style={{ position: 'relative', borderLeft: '1px solid var(--border)' }}>
                        {HOURS.map((h, i) => (
                          <div key={h} onClick={() => openNewModal(currentDate, h)} style={{ height: ROW_H, borderTop: i > 0 ? `1px ${h.endsWith(':30') ? 'dashed' : 'solid'} var(--border)` : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(230,0,126,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          />
                        ))}
                        {/* Appointments */}
                        {agendamentos
                          .filter(a => isSameDay(new Date(a.startTime), currentDate) && (prof.id === 'all' || a.profissionalId === prof.id))
                          .map(a => renderAppointmentCard(a))}
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
            )}

            {/* WEEK VIEW */}
            {view === 'week' && (() => {
              const weekDays = getWeekDays(currentDate);
              return (
                <div style={{ ...cardS, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(7, 1fr)`, borderBottom: '2px solid var(--border)' }}>
                    <div style={{ padding: '12px 8px' }} />
                    {weekDays.map((d, i) => {
                      const isToday2 = isSameDay(d, today);
                      return (
                        <div key={i} onClick={() => { setCurrentDate(d); setView('day'); }} style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s', background: isToday2 ? 'rgba(230,0,126,0.05)' : 'transparent' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{DAYS_PT[d.getDay()]}</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isToday2 ? '#fff' : 'var(--text-main)', background: isToday2 ? 'var(--primary)' : 'transparent', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>{d.getDate()}</div>
                        </div>
                      );
                    })}
                  </div>
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
                          {agendamentos.filter(a => isSameDay(new Date(a.startTime), d)).map(a => renderAppointmentCard(a, 100))}
                        </div>
                      ))}
                    </div>
                    {showNowLine && weekDays.some(d => isSameDay(d, today)) && (
                      <div style={{ position: 'absolute', top: nowTop, left: 56, right: 0, height: 2, background: '#ef4444', zIndex: 10, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5, background: '#ef4444' }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* MONTH VIEW */}
            {view === 'month' && (() => {
              const monthDays = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
              return (
                <div style={{ ...cardS, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid var(--border)' }}>
                    {DAYS_PT.map(d => (
                      <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', borderLeft: '1px solid var(--border)' }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                    {monthDays.map((d, i) => {
                      const isToday3 = isSameDay(d, today);
                      const isCurrentMonth2 = d.getMonth() === currentDate.getMonth();
                      const dayAppts = agendamentos.filter(a => isSameDay(new Date(a.startTime), d));
                      return (
                        <div key={i} onClick={() => { setCurrentDate(d); setView('day'); }}
                          style={{
                            minHeight: 90, padding: '6px 8px', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                            cursor: 'pointer', background: isToday3 ? 'rgba(230,0,126,0.03)' : !isCurrentMonth2 ? 'rgba(0,0,0,0.02)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { if (!isToday3) e.currentTarget.style.background = 'rgba(230,0,126,0.03)'; }}
                          onMouseLeave={e => { if (!isToday3) e.currentTarget.style.background = !isCurrentMonth2 ? 'rgba(0,0,0,0.02)' : 'transparent'; }}
                        >
                          <div style={{ fontWeight: isToday3 ? 900 : 600, fontSize: '0.85rem', color: !isCurrentMonth2 ? 'var(--text-muted)' : isToday3 ? 'var(--primary)' : 'var(--text-main)', marginBottom: 4, ...(isToday3 ? { background: 'var(--primary)', color: '#fff', width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}) }}>
                            {d.getDate()}
                          </div>
                          {dayAppts.slice(0, 3).map(a => {
                            const st2 = STATUS_COLORS[a.status] || STATUS_COLORS.pendente;
                            return (
                              <div key={a.id} style={{ background: st2.bg, borderLeft: `3px solid ${st2.border}`, borderRadius: 4, padding: '2px 6px', marginBottom: 2, fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: st2.text }}>
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
            })()}
          </div>
        </div>

        {/* FAB */}
        <button onClick={() => openNewModal()} style={{
          position: 'fixed', bottom: 32, right: 32, width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', border: 'none',
          boxShadow: '0 8px 24px rgba(230,0,126,0.35)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 100, transition: 'all 0.3s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add</span>
        </button>

        {/* NEW APPOINTMENT MODAL */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <div style={{ ...cardS, padding: 28, width: '90%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', animation: 'fadeInScale 0.25s ease-out' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>{editingId ? 'edit_calendar' : 'add_circle'}</span>
                {editingId ? 'Editar Agendamento' : 'Novo Agendamento'}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Cliente *</label>
                  <input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} placeholder="Nome do cliente" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Telefone</label>
                  <input value={form.clientPhone} onChange={e => setForm({ ...form, clientPhone: e.target.value })} style={inputS} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Procedimento *</label>
                  <input value={form.procedimento} onChange={e => setForm({ ...form, procedimento: e.target.value })} style={inputS} placeholder="Ex: Depilação Laser" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Profissional *</label>
                  <select value={form.profissionalId} onChange={e => setForm({ ...form, profissionalId: e.target.value })} style={selectS}>
                    <option value="">Selecione</option>
                    {profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Data *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} style={inputS} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Início</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select value={form.startHour} onChange={e => setForm({ ...form, startHour: e.target.value })} style={{ ...selectS, flex: 1 }}>
                      {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}h</option>)}
                    </select>
                    <select value={form.startMin} onChange={e => setForm({ ...form, startMin: e.target.value })} style={{ ...selectS, flex: 1 }}>
                      {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}min</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Fim</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select value={form.endHour} onChange={e => setForm({ ...form, endHour: e.target.value })} style={{ ...selectS, flex: 1 }}>
                      {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}h</option>)}
                    </select>
                    <select value={form.endMin} onChange={e => setForm({ ...form, endMin: e.target.value })} style={{ ...selectS, flex: 1 }}>
                      {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}min</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={selectS}>
                    {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Sala</label>
                  <input value={form.sala} onChange={e => setForm({ ...form, sala: e.target.value })} style={inputS} placeholder="Ex: Sala A" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Sessão</label>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="number" min={1} value={form.sessionNumber} onChange={e => setForm({ ...form, sessionNumber: e.target.value })} style={{ ...inputS, flex: 1 }} placeholder="Atual" />
                    <span style={{ fontWeight: 800, color: 'var(--text-muted)' }}>/</span>
                    <input type="number" min={1} value={form.totalSessions} onChange={e => setForm({ ...form, totalSessions: e.target.value })} style={{ ...inputS, flex: 1 }} placeholder="Total" />
                  </div>
                </div>
                {canMultiUnit && (
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Unidade</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={selectS}>
                    {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Observações</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputS, minHeight: 60, resize: 'vertical' }} placeholder="Notas adicionais..." />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
                <div>
                  {editingId && (
                    <button onClick={() => { deleteAgendamento(editingId); setShowModal(false); }} style={{ ...btnPrimary, background: 'linear-gradient(135deg, #ef4444, #f87171)', padding: '10px 16px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span> Excluir
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowModal(false)} style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '10px 20px' }}>Cancelar</button>
                  <button onClick={saveAgendamento} disabled={!form.clientName || !form.procedimento || !form.profissionalId} style={{ ...btnPrimary, padding: '10px 20px', opacity: !form.clientName || !form.procedimento || !form.profissionalId ? 0.5 : 1 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> {editingId ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PROFISSIONAL MODAL */}
        {showProfModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={e => { if (e.target === e.currentTarget) setShowProfModal(false); }}
          >
            <div style={{ ...cardS, padding: 28, width: '90%', maxWidth: 400, animation: 'fadeInScale 0.25s ease-out' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 20 }}>Novo Profissional</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Nome *</label>
                  <input value={profForm.name} onChange={e => setProfForm({ ...profForm, name: e.target.value })} style={inputS} placeholder="Nome do profissional" />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Cor</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={profForm.color} onChange={e => setProfForm({ ...profForm, color: e.target.value })} style={{ width: 40, height: 36, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{profForm.color}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Unidade</label>
                    <select value={profForm.unit} onChange={e => setProfForm({ ...profForm, unit: e.target.value })} style={selectS}>
                      {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button onClick={() => setShowProfModal(false)} style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}>Cancelar</button>
                <button onClick={saveProfissional} disabled={!profForm.name} style={{ ...btnPrimary, opacity: !profForm.name ? 0.5 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Criar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
