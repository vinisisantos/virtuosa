import { useState, useEffect, useCallback, useRef } from 'react';
import type { Agendamento, Profissional, AgendaForm, ProfForm } from '@/components/agenda/agenda-constants';
import { dateKey, addDays, startOfWeek, getMonthDays } from '@/components/agenda/agenda-constants';

export function useAgenda() {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgendaForm>({
    clientName: '', clientPhone: '', procedimento: '', profissionalId: '',
    startDate: '', startHour: '09', startMin: '00', endHour: '10', endMin: '00',
    status: 'pendente', sala: '', sessionNumber: '', totalSessions: '', notes: '', unit: 'Barueri',
  });
  const [filterProf, setFilterProf] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProced, setFilterProced] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [search, setSearch] = useState('');
  const [showProfModal, setShowProfModal] = useState(false);
  const [profForm, setProfForm] = useState<ProfForm>({ name: '', color: '#e600a0', unit: 'Barueri' });
  const [now, setNow] = useState(new Date());
  const [canMultiUnit, setCanMultiUnit] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Tick clock every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load unit + permissions
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

  // CRUD — open modals
  const openNewModal = (date?: Date, hour?: string) => {
    const d = date || currentDate;
    const h = hour?.split(':')[0] || '09';
    const m = hour?.split(':')[1] || '00';
    const endH = String(Math.min(23, parseInt(h) + 1)).padStart(2, '0');
    setForm({
      clientName: '', clientPhone: '', procedimento: '', profissionalId: profissionais[0]?.id || '',
      startDate: dateKey(d), startHour: h, startMin: m, endHour: endH, endMin: m,
      status: 'pendente', sala: '', sessionNumber: '', totalSessions: '', notes: '', unit: filterUnit || 'Barueri',
    });
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

  const clearFilters = () => { setFilterProf(''); setFilterStatus(''); setFilterProced(''); setSearch(''); };

  return {
    // View state
    view, setView, currentDate, setCurrentDate, now,
    // Data
    agendamentos, profissionais,
    // Modal state
    showModal, setShowModal, editingId, form, setForm,
    showProfModal, setShowProfModal, profForm, setProfForm,
    // Filters
    filterProf, setFilterProf, filterStatus, setFilterStatus,
    filterProced, setFilterProced, filterUnit, setFilterUnit,
    search, setSearch, canMultiUnit, clearFilters,
    // Navigation
    goToday, goPrev, goNext,
    // CRUD
    openNewModal, openEditModal, saveAgendamento, deleteAgendamento, saveProfissional,
    // Refs
    gridRef,
  };
}
