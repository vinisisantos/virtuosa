import { useState, useEffect, useCallback, useRef } from 'react';
import type { Agendamento, Profissional, AgendaForm, ProfForm } from '@/components/agenda/agenda-constants';
import { dateKey, addDays, startOfWeek, getMonthDays } from '@/components/agenda/agenda-constants';
import { useNotification } from '@/components/ui/notifications';

interface CatalogService { id: string; name: string; duration: number; price: number; category: string; }
interface CrmClient { id: string; name: string; phone: string | null; }

export function useAgenda() {
  const { toast, confirm: showConfirm } = useNotification();
  const [view, setView] = useState<'list' | 'day' | 'week' | 'month'>('list');
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
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [crmClients, setCrmClients] = useState<CrmClient[]>([]);
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
      // 'month' and 'list' both show full month
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

  // Fetch catalog services once
  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(data => setCatalogServices(data.services || [])).catch(() => {});
    fetch('/api/clients?limit=1000').then(r => r.json()).then(data => setCrmClients((data.clients || []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })))).catch(() => {});
  }, []);

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
    try {
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
      const res = await fetch('/api/agenda', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Agenda save error:', res.status, errData);
        toast(`Erro ao salvar agendamento: ${errData?.error || res.statusText}`, 'error');
        return;
      }

      setShowModal(false);
      fetchData();
      toast(editingId ? 'Agendamento atualizado com sucesso!' : 'Agendamento criado com sucesso!', 'success');
    } catch (err) {
      console.error('Agenda save exception:', err);
      toast(`Erro ao criar agendamento: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, 'error');
    }
  };

  const deleteAgendamento = async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Excluir Agendamento',
      message: 'Tem certeza que deseja excluir este agendamento? Essa ação não pode ser desfeita.',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'delete_forever',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/agenda?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast('Erro ao excluir agendamento', 'error');
        return;
      }
      setShowModal(false);
      fetchData();
      toast('Agendamento excluído com sucesso!', 'success');
    } catch {
      toast('Erro ao excluir agendamento', 'error');
    }
  };

  const darBaixa = async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Dar Baixa no Procedimento',
      message: 'Deseja marcar este procedimento como finalizado?',
      confirmText: 'Sim, Dar Baixa',
      cancelText: 'Cancelar',
      variant: 'info',
      icon: 'check_circle',
    });
    if (!confirmed) return;
    try {
      const res = await fetch('/api/agenda', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'finalizado' }),
      });
      if (!res.ok) {
        toast('Erro ao dar baixa no procedimento', 'error');
        return;
      }
      setShowModal(false);
      fetchData();
      toast('Procedimento finalizado com sucesso!', 'success');
    } catch {
      toast('Erro ao dar baixa no procedimento', 'error');
    }
  };
  // Drag & Drop: reschedule appointment to new time
  const reschedule = async (agId: string, newStartTime: Date, newEndTime: Date) => {
    await fetch('/api/agenda', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agId, startTime: newStartTime.toISOString(), endTime: newEndTime.toISOString() }),
    });
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
    agendamentos, profissionais, catalogServices, crmClients,
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
    openNewModal, openEditModal, saveAgendamento, deleteAgendamento, darBaixa, saveProfissional,
    // Drag & Drop
    reschedule,
    // Refs
    gridRef,
  };
}
