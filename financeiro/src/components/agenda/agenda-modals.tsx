import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Profissional, AgendaForm, ProfForm } from './agenda-constants';
import { STATUS_COLORS, cardS, btnPrimary } from './agenda-constants';
import { DatePicker } from '@/components/ui/date-picker';
import { PatientAutocomplete, PatientData } from '@/components/patient-autocomplete';

interface CatalogService { id: string; name: string; duration: number; price: number; category: string; }
interface CrmClient { id: string; name: string; phone: string | null; }
interface ClientPackage { id: string; services: string; totalSessions: number; completedSessions: number; status: string; }
interface SystemUser { name: string; role: string; }

const H = 46; // uniform input height
const fieldS: React.CSSProperties = { width: '100%', padding: '0 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.88rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s', height: H, boxSizing: 'border-box' };
const labelS: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' };
const dropS: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' };
const dropItemS: React.CSSProperties = { padding: '10px 14px', cursor: 'pointer', fontSize: '0.82rem', transition: 'background 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
interface AppointmentModalProps {
  editingId: string | null;
  form: AgendaForm; setForm: (f: AgendaForm) => void;
  profissionais: Profissional[];
  canMultiUnit: boolean;
  catalogServices: CatalogService[];
  crmClients: CrmClient[];
  onSave: () => void;
  onDelete: (id: string) => Promise<boolean>;
  onDarBaixa: (id: string) => void;
  canDarBaixa: boolean;
  canExcluirFinalizado: boolean;
  onClose: () => void;
}

export function AppointmentModal({ editingId, form, setForm, profissionais, canMultiUnit, catalogServices, crmClients, onSave, onDelete, onDarBaixa, canDarBaixa, canExcluirFinalizado, onClose }: AppointmentModalProps) {
  /* ── Autocomplete state ── */
  const [clientOpen, setClientOpen] = useState(false);
  const [procOpen, setProcOpen] = useState(false);
  const [clientPkgs, setClientPkgs] = useState<ClientPackage[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);
  const procRef = useRef<HTMLDivElement>(null);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);

  // Load system users from API
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((users: any[]) => {
        setSystemUsers((users || []).filter((u: any) => u.isActive !== false).map((u: any) => ({ name: u.name, role: u.role || 'Usuário' })));
      })
      .catch(() => {});
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) setClientOpen(false);
      if (procRef.current && !procRef.current.contains(e.target as Node)) setProcOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch client packages when client name matches a CRM client
  const fetchClientPkgs = useCallback(async (clientName: string) => {
    const client = crmClients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
    if (!client) { setClientPkgs([]); return; }
    setLoadingPkgs(true);
    try {
      const res = await fetch(`/api/packages?search=${encodeURIComponent(clientName)}`);
      const data = await res.json();
      setClientPkgs((data.packages || []).filter((p: ClientPackage) => p.status === 'ativo'));
    } catch { setClientPkgs([]); }
    setLoadingPkgs(false);
  }, [crmClients]);

  // Filter lists
  const clientQuery = form.clientName.toLowerCase().trim();
  const filteredClients = clientQuery.length > 0
    ? crmClients.filter(c => c.name.toLowerCase().includes(clientQuery))
    : crmClients;

  const procQuery = form.procedimento.toLowerCase().trim();
  const filteredProcs = procQuery.length > 0
    ? catalogServices.filter(s => s.name.toLowerCase().includes(procQuery))
    : catalogServices;

  // Parse package services
  const parsePkgServices = (pkg: ClientPackage): { name: string; quantity: number }[] => {
    try { return JSON.parse(pkg.services); } catch { return []; }
  };

  // Group procedures by package (not flattened)
  const pkgGroups = clientPkgs.map(pkg => {
    const svcs = parsePkgServices(pkg);
    return {
      pkgId: pkg.id,
      totalSessions: pkg.totalSessions,
      completedSessions: pkg.completedSessions,
      status: pkg.status,
      services: svcs,
    };
  });

  // Flattened for backward compat (used in open-check)
  const pkgProcedures = pkgGroups.flatMap(g => g.services.map(s => ({ ...s, pkgId: g.pkgId, totalSessions: g.totalSessions, completedSessions: g.completedSessions })));

  /* ── Helpers ── */
  // Get the duration for the current procedure from catalog
  const getProcDuration = (procName: string): number => {
    const svc = catalogServices.find(s => s.name.toLowerCase() === procName.toLowerCase());
    return svc?.duration ?? 60;
  };

  // Calculate end hour/min from start + duration, snapping to 15min intervals
  const calcEndTime = (startH: number, startM: number, durMin: number) => {
    const totalMin = startH * 60 + startM + durMin;
    const endH = String(Math.min(21, Math.floor(totalMin / 60))).padStart(2, '0');
    // Snap to nearest 15-minute mark
    const rawMin = totalMin % 60;
    const endM = String(Math.round(rawMin / 15) * 15 % 60).padStart(2, '0');
    return { endH, endM };
  };

  /* ── Handlers ── */
  const selectClient = (name: string, phone?: string | null) => {
    setForm({ ...form, clientName: name, ...(phone ? { clientPhone: phone } : {}) });
    setClientOpen(false);
    fetchClientPkgs(name);
  };

  const handleStartChange = (newHour?: string, newMin?: string) => {
    const h = parseInt(newHour ?? form.startHour);
    const m = parseInt(newMin ?? form.startMin);
    if (form.procedimento) {
      const dur = getProcDuration(form.procedimento);
      const { endH, endM } = calcEndTime(h, m, dur);
      setForm({ ...form, ...(newHour ? { startHour: newHour } : {}), ...(newMin ? { startMin: newMin } : {}), endHour: endH, endMin: endM });
    } else {
      setForm({ ...form, ...(newHour ? { startHour: newHour } : {}), ...(newMin ? { startMin: newMin } : {}) });
    }
  };

  const selectProcedure = (name: string, duration?: number) => {
    const dur = duration ?? 60;
    const startH = parseInt(form.startHour);
    const startM = parseInt(form.startMin);
    const { endH, endM } = calcEndTime(startH, startM, dur);
    setForm({ ...form, procedimento: name, endHour: endH, endMin: endM });
    setProcOpen(false);
  };

  const selectPkgProcedure = (svcName: string, completed: number, total: number) => {
    const catalog = catalogServices.find(s => s.name.toLowerCase() === svcName.toLowerCase());
    const dur = catalog?.duration ?? 60;
    const startH = parseInt(form.startHour);
    const startM = parseInt(form.startMin);
    const { endH, endM } = calcEndTime(startH, startM, dur);
    setForm({ ...form, procedimento: svcName, endHour: endH, endMin: endM, sessionNumber: String(completed + 1), totalSessions: String(total) });
    setProcOpen(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...cardS, padding: 28, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', animation: 'fadeInScale 0.25s ease-out' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>{editingId ? 'edit_calendar' : 'add_circle'}</span>
          {editingId ? 'Editar Agendamento' : 'Novo Agendamento'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {/* ── CLIENTE (full width, smart autocomplete) ── */}
          <div style={{ gridColumn: '1 / -1' }}>
            <PatientAutocomplete
              onSelect={(patient: PatientData) => {
                setForm({ ...form, clientName: patient.name, clientPhone: patient.phone || '' });
                fetchClientPkgs(patient.name);
              }}
              onClear={() => { setForm({ ...form, clientName: '', clientPhone: '' }); setClientPkgs([]); }}
              onNameChange={name => { setForm({ ...form, clientName: name }); }}
              label="Cliente"
              required
              placeholder="Digite o nome do cliente"
              variant="compact"
            />
          </div>

          {/* TELEFONE */}
          <div>
            <label style={labelS}>Telefone</label>
            <input value={form.clientPhone} onChange={e => setForm({ ...form, clientPhone: e.target.value })} style={fieldS} placeholder="(11) 99999-9999" />
          </div>

          {/* ── PROCEDIMENTO (custom autocomplete + package procedures) ── */}
          <div style={{ position: 'relative' }} ref={procRef}>
            <label style={labelS}>Procedimento *</label>
            <input
              value={form.procedimento}
              onChange={e => { setForm({ ...form, procedimento: e.target.value }); setProcOpen(true); }}
              onFocus={() => setProcOpen(true)}
              style={fieldS}
              placeholder="Ex: Laser, Botox..."
              autoComplete="off"
            />
            {procOpen && pkgGroups.length > 0 && (
              <div style={dropS}>
                {pkgGroups.map((group, gi) => {
                  const filteredSvcs = procQuery
                    ? group.services.filter(s => s.name.toLowerCase().includes(procQuery))
                    : group.services;
                  if (filteredSvcs.length === 0) return null;
                  const totalQty = group.services.reduce((sum, s) => sum + (s.quantity || 1), 0);
                  const pct = totalQty > 0 ? Math.round((group.completedSessions / totalQty) * 100) : 0;
                  return (
                    <div key={group.pkgId}>
                      {/* Package header */}
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: gi % 2 === 0 ? 'rgba(230,0,160,0.04)' : 'rgba(99,102,241,0.04)', ...(gi > 0 ? { borderTop: '3px solid var(--border)' } : {}) }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📦 Pacote {gi + 1}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: group.completedSessions >= totalQty ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: group.completedSessions >= totalQty ? '#ef4444' : '#10b981' }}>
                            {group.completedSessions}/{totalQty}
                          </span>
                        </div>
                        {/* Mini progress bar */}
                        <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: group.completedSessions >= totalQty ? '#ef4444' : 'linear-gradient(90deg, #10b981, #34d399)', transition: 'width 0.3s' }} />
                        </div>
                      </div>
                      {/* Services in this package */}
                      {filteredSvcs.map((s, si) => (
                        <div key={`pkg-${gi}-${si}`}
                          onClick={() => selectPkgProcedure(s.name, group.completedSessions, totalQty)}
                          style={{ ...dropItemS, paddingLeft: 20, background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                            {s.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>× {s.quantity}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {procOpen && pkgGroups.length === 0 && form.clientName.trim().length > 0 && (
              <div style={dropS}>
                <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Nenhum pacote encontrado para este cliente
                </div>
              </div>
            )}
          </div>

          {/* PROFISSIONAL */}
          <div>
            <label style={labelS}>Profissional *</label>
            <select value={form.profissionalId} onChange={e => setForm({ ...form, profissionalId: e.target.value })} style={{ ...fieldS, cursor: 'pointer' }}>
              <option value="">Selecione</option>
              {profissionais.length > 0 && (
                <optgroup label="📋 Profissionais Cadastrados">
                  {profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              )}
              {systemUsers.length > 0 && (
                <optgroup label="👥 Usuários do Sistema">
                  {systemUsers.filter(u => !profissionais.some(p => p.name.toLowerCase() === u.name.toLowerCase())).map((u, i) => (
                    <option key={`user-${i}`} value={`user-${u.name}`}>{u.name} ({u.role})</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* DATA */}
          <div>
            <label style={labelS}>Data *</label>
            <DatePicker value={form.startDate} onChange={v => setForm({ ...form, startDate: v })} variant="input" />
          </div>

          {/* INÍCIO */}
          <div>
            <label style={labelS}>Início</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={form.startHour} onChange={e => handleStartChange(e.target.value, undefined)} style={{ ...fieldS, flex: 1, cursor: 'pointer' }}>
                {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}h</option>)}
              </select>
              <select value={form.startMin} onChange={e => handleStartChange(undefined, e.target.value)} style={{ ...fieldS, flex: 1, cursor: 'pointer' }}>
                {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}min</option>)}
              </select>
            </div>
          </div>

          {/* FIM */}
          <div>
            <label style={labelS}>Fim</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={form.endHour} onChange={e => setForm({ ...form, endHour: e.target.value })} style={{ ...fieldS, flex: 1, cursor: 'pointer' }}>
                {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}h</option>)}
              </select>
              <select value={form.endMin} onChange={e => setForm({ ...form, endMin: e.target.value })} style={{ ...fieldS, flex: 1, cursor: 'pointer' }}>
                {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}min</option>)}
              </select>
            </div>
          </div>

          {/* STATUS */}
          <div>
            <label style={labelS}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={{ ...fieldS, cursor: 'pointer' }}>
              {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* SALA */}
          <div>
            <label style={labelS}>Sala</label>
            <input value={form.sala} onChange={e => setForm({ ...form, sala: e.target.value })} style={fieldS} placeholder="Ex: Sala A" />
          </div>

          {/* SESSÃO */}
          <div>
            <label style={labelS}>Sessão</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min={1} value={form.sessionNumber} onChange={e => setForm({ ...form, sessionNumber: e.target.value })} style={{ ...fieldS, flex: 1, textAlign: 'center' }} placeholder="Atual" />
              <span style={{ fontWeight: 800, color: 'var(--text-muted)' }}>/</span>
              <input type="number" min={1} value={form.totalSessions} onChange={e => setForm({ ...form, totalSessions: e.target.value })} style={{ ...fieldS, flex: 1, textAlign: 'center' }} placeholder="Total" />
            </div>
          </div>



          {/* OBSERVAÇÕES */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelS}>Observações</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...fieldS, height: 'auto', minHeight: 60, padding: '12px 14px', resize: 'vertical' }} placeholder="Notas adicionais..." />
          </div>
        </div>

        {/* ── Buttons ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {editingId && (() => {
              const isFinalizado = form.status === 'finalizado';
              const canDelete = !isFinalizado || canExcluirFinalizado;
              
              if (!canDelete) {
                return (
                  <span
                    title="Este agendamento já possui sessão concluída e só pode ser excluído por um administrador ou usuário com permissão específica."
                    style={{
                      ...btnPrimary,
                      background: 'linear-gradient(135deg, #6b7280, #9ca3af)',
                      padding: '10px 16px',
                      opacity: 0.5,
                      cursor: 'not-allowed',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>lock</span> Excluir
                  </span>
                );
              }
              
              return (
                <button onClick={async () => {
                  const deleted = await onDelete(editingId);
                  if (deleted) onClose();
                }} style={{
                  ...btnPrimary,
                  background: isFinalizado
                    ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                    : 'linear-gradient(135deg, #ef4444, #f87171)',
                  padding: '10px 16px',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  {isFinalizado ? '🔑 Excluir' : 'Excluir'}
                </button>
              );
            })()}
            {editingId && form.status !== 'finalizado' && canDarBaixa && (
              <button onClick={async () => { await onDarBaixa(editingId); onClose(); }} style={{ ...btnPrimary, background: 'linear-gradient(135deg, #10b981, #34d399)', padding: '10px 16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span> Dar Baixa
              </button>
            )}
            {editingId && form.status === 'finalizado' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#10b981', padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>verified</span> Finalizado
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '10px 20px' }}>Cancelar</button>
            <button onClick={onSave} disabled={!form.clientName || !form.procedimento || !form.profissionalId} style={{ ...btnPrimary, padding: '10px 20px', opacity: !form.clientName || !form.procedimento || !form.profissionalId ? 0.5 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> {editingId ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Professional Management Modal ──────────── */
interface ProfModalProps {
  profForm: ProfForm; setProfForm: (f: ProfForm) => void;
  profissionais: { id: string; name: string; color: string; unit: string }[];
  onSave: () => void;
  onEdit: (id: string, data: ProfForm) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ProfissionalModal({ profForm, setProfForm, profissionais, onSave, onEdit, onDelete, onClose }: ProfModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProfForm>({ name: '', color: '#e600a0', unit: 'SCS' });

  const startEdit = (p: { id: string; name: string; color: string; unit: string }) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, color: p.color, unit: p.unit });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = () => {
    if (editingId && editForm.name.trim()) {
      onEdit(editingId, editForm);
      setEditingId(null);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...cardS, padding: 28, width: '90%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto', animation: 'fadeInScale 0.25s ease-out' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>badge</span>
          Gerenciar Profissionais
        </h2>

        {/* Existing professionals list */}
        {profissionais.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 8 }}>
              Cadastrados ({profissionais.length})
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {profissionais.map((p, idx) => (
                <div key={p.id} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: editingId === p.id ? 'rgba(99,102,241,0.04)' : 'transparent', transition: 'all 0.15s' }}>
                  {editingId === p.id ? (
                    /* ── Editing mode ── */
                    <div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          style={{ ...fieldS, flex: 1, height: 38 }} placeholder="Nome" />
                        <input type="color" value={editForm.color} onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                          style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveEdit} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem', fontFamily: 'inherit' }}>
                          Salvar
                        </button>
                        <button onClick={cancelEdit} style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem', fontFamily: 'inherit' }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display mode ── */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', width: 20 }}>{idx + 1}.</span>
                      <div style={{ width: 14, height: 14, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{p.name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{p.unit}</div>
                      </div>
                      <button onClick={() => startEdit(p)} title="Editar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>edit</span>
                      </button>
                      <button onClick={() => onDelete(p.id)} title="Excluir"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add new professional form */}
        <div style={{ borderTop: profissionais.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: profissionais.length > 0 ? 16 : 0 }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 8 }}>
            ➕ Adicionar novo profissional
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Nome *</label>
              <input value={profForm.name} onChange={e => setProfForm({ ...profForm, name: e.target.value })} style={fieldS} placeholder="Nome do profissional" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Cor</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={profForm.color} onChange={e => setProfForm({ ...profForm, color: e.target.value })} style={{ width: 40, height: 36, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{profForm.color}</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}>Fechar</button>
          <button onClick={onSave} disabled={!profForm.name} style={{ ...btnPrimary, opacity: !profForm.name ? 0.5 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span> Criar
          </button>
        </div>
      </div>
    </div>
  );
}
