'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { cardS } from '@/hooks/useDashboard';
import { useNotification } from '@/components/ui/notifications';
import { useGlobalUnit } from '@/contexts/UnitContext';

interface AbsenceSlot { start: string; end: string; }
interface Profissional { id: string; name: string; specialty: string; color: string; unit: string; absenceSchedule?: Record<string, AbsenceSlot[]>; }
interface Agendamento { id: string; clientName: string; procedimento: string; profissionalId: string; startTime: string; endTime: string; status: string; unit: string; }

const DAYS_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const emptySchedule = (): Record<string, AbsenceSlot[]> => Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), []]));
const timeFieldS: React.CSSProperties = { width: 90, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.82rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none', textAlign: 'center' as const };

const fieldS: React.CSSProperties = { width: '100%', padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.85rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s', height: 42, boxSizing: 'border-box' as const };
const btnS: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s', fontFamily: 'inherit' };

export function ProfessionalDashboard() {
  const { toast, confirm: showConfirm } = useNotification();
  const { globalUnit } = useGlobalUnit();
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProf, setSelectedProf] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', color: '#e600a0', unit: globalUnit || 'Barueri' });

  // Create state
  const [showCreate, setShowCreate] = useState(false);

  // Absence schedule state
  const [scheduleEditId, setScheduleEditId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<Record<string, AbsenceSlot[]>>(emptySchedule());
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', color: '#e600a0', unit: globalUnit || 'Barueri' });

  // Sync createForm.unit with globalUnit
  useEffect(() => {
    if (globalUnit) {
      setCreateForm(prev => ({ ...prev, unit: globalUnit }));
    }
  }, [globalUnit]);

  const fetchData = useCallback(() => {
    const unitParam = globalUnit ? `?unit=${encodeURIComponent(globalUnit)}` : '';
    Promise.all([
      fetch(`/api/profissionais${unitParam}`).then(r => r.json()),
      fetch(`/api/agenda${unitParam}`).then(r => r.json()),
    ]).then(([profs, ags]) => {
      const allProfs: Profissional[] = Array.isArray(profs) ? profs : profs.profissionais || [];
      // Extra safety: filter by selected unit
      if (globalUnit) {
        setProfissionais(allProfs.filter(p => p.unit === globalUnit));
      } else {
        setProfissionais(allProfs);
      }
      const allAgs: Agendamento[] = Array.isArray(ags) ? ags : ags.agendamentos || [];
      if (globalUnit) {
        setAgendamentos(allAgs.filter(a => a.unit === globalUnit));
      } else {
        setAgendamentos(allAgs);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [globalUnit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // CRUD operations
  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    try {
      const res = await fetch('/api/profissionais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createForm) });
      if (!res.ok) { toast('Erro ao criar profissional', 'error'); return; }
      setCreateForm({ name: '', color: '#e600a0', unit: 'Barueri' });
      setShowCreate(false);
      fetchData();
      toast('Profissional criado com sucesso!', 'success');
    } catch { toast('Erro ao criar profissional', 'error'); }
  };

  const handleEdit = async () => {
    if (!editingId || !editForm.name.trim()) return;
    try {
      const res = await fetch('/api/profissionais', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...editForm }) });
      if (!res.ok) { toast('Erro ao editar profissional', 'error'); return; }
      setEditingId(null);
      fetchData();
      toast('Profissional atualizado!', 'success');
    } catch { toast('Erro ao editar profissional', 'error'); }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await showConfirm({
      title: 'Excluir Profissional',
      message: `Tem certeza que deseja excluir "${name}"? Ele será desativado e não aparecerá mais na agenda.`,
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'person_remove',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/profissionais?id=${id}`, { method: 'DELETE' });
      if (!res.ok) { toast('Erro ao excluir profissional', 'error'); return; }
      if (selectedProf === id) setSelectedProf(null);
      fetchData();
      toast('Profissional excluído com sucesso!', 'success');
    } catch { toast('Erro ao excluir profissional', 'error'); }
  };

  const startEdit = (p: Profissional) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, color: p.color, unit: p.unit });
  };

  // Absence schedule
  const openScheduleEditor = (p: Profissional) => {
    if (scheduleEditId === p.id) { setScheduleEditId(null); return; }
    setScheduleEditId(p.id);
    const existing = p.absenceSchedule || emptySchedule();
    // Ensure all 7 days exist
    const full = emptySchedule();
    for (const [k, v] of Object.entries(existing)) { full[k] = v as AbsenceSlot[]; }
    setScheduleForm(full);
  };

  const updateSlot = (day: string, idx: number, field: 'start' | 'end', value: string) => {
    setScheduleForm(prev => {
      const copy = { ...prev };
      copy[day] = [...(copy[day] || [])];
      copy[day][idx] = { ...copy[day][idx], [field]: value };
      return copy;
    });
  };

  const addSlot = (day: string) => {
    setScheduleForm(prev => {
      const copy = { ...prev };
      const slots = [...(copy[day] || [])];
      if (slots.length >= 4) return prev;
      slots.push({ start: '', end: '' });
      copy[day] = slots;
      return copy;
    });
  };

  const removeSlot = (day: string, idx: number) => {
    setScheduleForm(prev => {
      const copy = { ...prev };
      copy[day] = [...(copy[day] || [])].filter((_, i) => i !== idx);
      return copy;
    });
  };

  const saveSchedule = async () => {
    if (!scheduleEditId) return;
    setSavingSchedule(true);
    try {
      const res = await fetch('/api/profissionais', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scheduleEditId, absenceSchedule: scheduleForm }),
      });
      if (!res.ok) { toast('Erro ao salvar escala', 'error'); return; }
      fetchData();
      toast('Horário de trabalho salvo!', 'success');
    } catch { toast('Erro ao salvar escala', 'error'); }
    finally { setSavingSchedule(false); }
  };

  const profStats = profissionais.map(p => {
    const profAgs = agendamentos.filter(a => a.profissionalId === p.id);
    const monthAgs = profAgs.filter(a => {
      const d = new Date(a.startTime);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const total = monthAgs.length;
    const completed = monthAgs.filter(a => a.status === 'finalizado').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    const todayAgs = profAgs.filter(a => new Date(a.startTime).toDateString() === now.toDateString());
    return { ...p, total, completed, completionRate, todayCount: todayAgs.length, todayAgs, monthAgs };
  });

  const selected = selectedProf ? profStats.find(p => p.id === selectedProf) : null;

  if (loading) return <div style={cardS}><div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Overview KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {[
          { icon: 'badge', color: '#6366f1', label: 'Profissionais', value: String(profissionais.length) },
          { icon: 'event', color: '#10b981', label: 'Atend. este Mês', value: String(profStats.reduce((s, p) => s + p.total, 0)) },
          { icon: 'check_circle', color: '#3b82f6', label: 'Finalizados', value: String(profStats.reduce((s, p) => s + p.completed, 0)) },
          { icon: 'today', color: '#f59e0b', label: 'Hoje', value: String(profStats.reduce((s, p) => s + p.todayCount, 0)) },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => setShowCreate(!showCreate)}
          style={{ ...btnS, background: showCreate ? 'var(--border)' : 'linear-gradient(135deg, var(--primary), #ff4db1)', color: showCreate ? 'var(--text-main)' : '#fff' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showCreate ? 'close' : 'person_add'}</span>
          {showCreate ? 'Cancelar' : 'Novo Profissional'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ ...cardS, padding: '20px 24px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>person_add</span>
            Adicionar Profissional
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' as const }}>Nome *</label>
              <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} style={fieldS} placeholder="Nome do profissional"
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' as const }}>Cor</label>
              <input type="color" value={createForm.color} onChange={e => setCreateForm({ ...createForm, color: e.target.value })}
                style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' as const }}>Unidade</label>
              <select value={createForm.unit} onChange={e => setCreateForm({ ...createForm, unit: e.target.value })} style={{ ...fieldS, cursor: 'pointer', width: 120 }}>
                {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <button onClick={handleCreate} disabled={!createForm.name.trim()}
              style={{ ...btnS, background: 'linear-gradient(135deg, #10b981, #34d399)', color: '#fff', height: 42, opacity: !createForm.name.trim() ? 0.5 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span> Criar
            </button>
          </div>
        </div>
      )}

      {/* Professional cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {profStats.map((p, idx) => {
          const isSelected = selectedProf === p.id;
          const isEditing = editingId === p.id;

          return (
            <div key={p.id}
              style={{
                background: 'var(--card-bg)', borderRadius: 20, border: isSelected ? `2px solid ${p.color}` : '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)', overflow: 'hidden', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}>
              <div style={{ height: 4, background: p.color }} />
              <div style={{ padding: '18px 22px' }}>
                {isEditing ? (
                  /* ── Inline editing ── */
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        style={{ ...fieldS, flex: 1 }} placeholder="Nome" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') setEditingId(null); }} />
                      <input type="color" value={editForm.color} onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                        style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={editForm.unit} onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                        style={{ ...fieldS, flex: 1, cursor: 'pointer' }}>
                        {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <button onClick={handleEdit} style={{ ...btnS, background: '#10b981', color: '#fff' }}>Salvar</button>
                      <button onClick={() => setEditingId(null)} style={{ ...btnS, background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>✕</button>
                    </div>
                  </div>
                ) : (
                  /* ── Display mode ── */
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.88rem' }}>
                        {p.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
                      </div>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSelectedProf(isSelected ? null : p.id)}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>{p.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>• {p.unit}</div>
                      </div>
                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {p.todayCount > 0 && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981', marginRight: 4 }}>{p.todayCount} hoje</span>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); startEdit(p); }} title="Editar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', transition: 'all 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>edit</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }} title="Excluir"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', transition: 'all 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openScheduleEditor(p); }} title="Horário de Trabalho"
                          style={{ background: scheduleEditId === p.id ? 'rgba(245,158,11,0.15)' : 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', transition: 'all 0.15s' }}
                          onMouseEnter={e => { if (scheduleEditId !== p.id) e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; }}
                          onMouseLeave={e => { if (scheduleEditId !== p.id) e.currentTarget.style.background = 'none'; }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>schedule</span>
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, cursor: 'pointer' }} onClick={() => setSelectedProf(isSelected ? null : p.id)}>
                      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#6366f1' }}>{p.total}</div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>AGENDA</div>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>{p.completed}</div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>FEITOS</div>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: p.completionRate >= 70 ? '#10b981' : '#f59e0b' }}>{p.completionRate.toFixed(0)}%</div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>TAXA</div>
                      </div>
                    </div>

                    {/* Absence schedule editor (expandable) */}
                    {scheduleEditId === p.id && (
                      <div style={{ marginTop: 14, padding: '12px', background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>schedule</span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>Horário de Trabalho</span>
                          </div>
                          <button onClick={saveSchedule} disabled={savingSchedule}
                            style={{ ...btnS, background: 'linear-gradient(135deg, #10b981, #34d399)', color: '#fff', padding: '5px 12px', fontSize: '0.72rem', opacity: savingSchedule ? 0.6 : 1 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{savingSchedule ? 'progress_activity' : 'save'}</span>
                            {savingSchedule ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                          {DAYS_LABEL.map((dayName, dayIdx) => {
                            const dayKey = String(dayIdx);
                            const slots = scheduleForm[dayKey] || [];
                            return (
                              <div key={dayIdx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '6px 0', borderTop: dayIdx > 0 ? '1px solid var(--border)' : 'none' }}>
                                <div style={{ width: 32, paddingTop: 4, fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>{DAYS_SHORT[dayIdx]}</div>
                                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                  {slots.length === 0 && (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                                  )}
                                  {slots.map((slot, si) => (
                                    <div key={si} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--card-bg)', borderRadius: 6, padding: '2px 4px', border: '1px solid var(--border)' }}>
                                      <input type="time" value={slot.start} onChange={e => updateSlot(dayKey, si, 'start', e.target.value)}
                                        style={{ width: 72, padding: '3px 4px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: '0.72rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none' }} />
                                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>–</span>
                                      <input type="time" value={slot.end} onChange={e => updateSlot(dayKey, si, 'end', e.target.value)}
                                        style={{ width: 72, padding: '3px 4px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: '0.72rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none' }} />
                                      <button onClick={() => removeSlot(dayKey, si)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex', lineHeight: 1 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#ef4444' }}>close</span>
                                      </button>
                                    </div>
                                  ))}
                                  {slots.length < 4 && (
                                    <button onClick={() => addSlot(dayKey)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit' }}>
                                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--primary)' }}>add_circle</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded detail */}
      {selected && (
        <div style={cardS}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: selected.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.82rem' }}>
              {selected.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 900 }}>{selected.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Agenda do dia • {now.toLocaleDateString('pt-BR')}</div>
            </div>
          </div>

          {selected.todayAgs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>event_available</span>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Sem atendimentos hoje</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selected.todayAgs.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(a => {
                const start = new Date(a.startTime);
                const end = new Date(a.endTime);
                const statusColors: Record<string, string> = { pendente: '#f59e0b', confirmado: '#3b82f6', em_atendimento: '#6366f1', finalizado: '#10b981', falta: '#ef4444', cancelado: '#94a3b8', ausente: '#9ca3af' };
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', minWidth: 90 }}>
                      {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{a.clientName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.procedimento}</div>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${statusColors[a.status] || '#94a3b8'}15`, color: statusColors[a.status] || '#94a3b8' }}>
                      {a.status.replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
