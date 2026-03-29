import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Profissional, AgendaForm, ProfForm } from './agenda-constants';
import { STATUS_COLORS, cardS, btnPrimary } from './agenda-constants';

interface CatalogService { id: string; name: string; duration: number; price: number; category: string; }
interface CrmClient { id: string; name: string; phone: string | null; }
interface ClientPackage { id: string; services: string; totalSessions: number; completedSessions: number; status: string; }
interface SystemUser { name: string; role: string; }

const H = 46; // uniform input height
const fieldS: React.CSSProperties = { width: '100%', padding: '0 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.88rem', fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s', height: H, boxSizing: 'border-box' };
const labelS: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' };
const dropS: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' };
const dropItemS: React.CSSProperties = { padding: '10px 14px', cursor: 'pointer', fontSize: '0.82rem', transition: 'background 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface AppointmentModalProps {
  editingId: string | null;
  form: AgendaForm; setForm: (f: AgendaForm) => void;
  profissionais: Profissional[];
  canMultiUnit: boolean;
  catalogServices: CatalogService[];
  crmClients: CrmClient[];
  onSave: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function AppointmentModal({ editingId, form, setForm, profissionais, canMultiUnit, catalogServices, crmClients, onSave, onDelete, onClose }: AppointmentModalProps) {
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

  // All procedures from client packages (flattened)
  const pkgProcedures = clientPkgs.flatMap(pkg => {
    const svcs = parsePkgServices(pkg);
    return svcs.map(s => ({ ...s, pkgId: pkg.id, totalSessions: pkg.totalSessions, completedSessions: pkg.completedSessions }));
  });

  /* ── Handlers ── */
  const selectClient = (name: string, phone?: string | null) => {
    setForm({ ...form, clientName: name, ...(phone ? { clientPhone: phone } : {}) });
    setClientOpen(false);
    fetchClientPkgs(name);
  };

  const selectProcedure = (name: string, duration?: number) => {
    const dur = duration ?? 60;
    const startH = parseInt(form.startHour);
    const startM = parseInt(form.startMin);
    const totalMin = startH * 60 + startM + dur;
    const endH = String(Math.min(21, Math.floor(totalMin / 60))).padStart(2, '0');
    const endM = totalMin % 60 < 15 ? '00' : totalMin % 60 < 45 ? '30' : '00';
    setForm({ ...form, procedimento: name, endHour: endH, endMin: endM });
    setProcOpen(false);
  };

  const selectPkgProcedure = (svcName: string, completed: number, total: number) => {
    const catalog = catalogServices.find(s => s.name.toLowerCase() === svcName.toLowerCase());
    const dur = catalog?.duration ?? 60;
    const startH = parseInt(form.startHour);
    const startM = parseInt(form.startMin);
    const totalMin = startH * 60 + startM + dur;
    const endH = String(Math.min(21, Math.floor(totalMin / 60))).padStart(2, '0');
    const endM = totalMin % 60 < 15 ? '00' : totalMin % 60 < 45 ? '30' : '00';
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
          {/* ── CLIENTE (full width, custom autocomplete) ── */}
          <div style={{ gridColumn: '1 / -1', position: 'relative' }} ref={clientRef}>
            <label style={labelS}>Cliente *</label>
            <input
              value={form.clientName}
              onChange={e => { setForm({ ...form, clientName: e.target.value }); setClientOpen(true); }}
              onFocus={() => setClientOpen(true)}
              style={fieldS}
              placeholder="Digite o nome do cliente"
              autoComplete="off"
            />
            {clientOpen && filteredClients.length > 0 && (
              <div style={dropS}>
                {filteredClients.slice(0, 15).map(c => (
                  <div key={c.id} onClick={() => selectClient(c.name, c.phone)}
                    style={dropItemS}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    {c.phone && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.phone}</span>}
                  </div>
                ))}
              </div>
            )}
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
            {procOpen && (filteredProcs.length > 0 || pkgProcedures.length > 0) && (
              <div style={dropS}>
                {/* Client package procedures first */}
                {pkgProcedures.length > 0 && (
                  <>
                    <div style={{ padding: '8px 14px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'rgba(230,0,160,0.04)' }}>
                      📦 Pacotes do Cliente
                    </div>
                    {pkgProcedures.filter(p => !procQuery || p.name.toLowerCase().includes(procQuery)).map((p, i) => (
                      <div key={`pkg-${i}`} onClick={() => selectPkgProcedure(p.name, p.completedSessions, p.totalSessions)}
                        style={{ ...dropItemS, background: 'rgba(16,185,129,0.03)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.03)')}
                      >
                        <span style={{ fontWeight: 600 }}>{p.name} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>× {p.quantity}</span></span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: p.completedSessions >= p.totalSessions ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', color: p.completedSessions >= p.totalSessions ? '#ef4444' : '#10b981' }}>
                          {p.completedSessions}/{p.totalSessions}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {/* Catalog procedures */}
                {filteredProcs.length > 0 && (
                  <>
                    <div style={{ padding: '8px 14px', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                      📋 Catálogo
                    </div>
                    {filteredProcs.slice(0, 20).map(s => (
                      <div key={s.id} onClick={() => selectProcedure(s.name, s.duration)}
                        style={dropItemS}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>{s.category}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {s.duration > 0 && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6366f1', padding: '1px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.08)' }}>{s.duration}min</span>}
                          {s.price > 0 && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10b981' }}>{fmt(s.price)}</span>}
                        </div>
                      </div>
                    ))}
                  </>
                )}
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
            <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} style={fieldS} />
          </div>

          {/* INÍCIO */}
          <div>
            <label style={labelS}>Início</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={form.startHour} onChange={e => setForm({ ...form, startHour: e.target.value })} style={{ ...fieldS, flex: 1, cursor: 'pointer' }}>
                {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}h</option>)}
              </select>
              <select value={form.startMin} onChange={e => setForm({ ...form, startMin: e.target.value })} style={{ ...fieldS, flex: 1, cursor: 'pointer' }}>
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
            {!editingId && form.totalSessions && parseInt(form.totalSessions) > 1 && (
              <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#6366f1' }}>repeat</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#6366f1' }}>
                  {parseInt(form.totalSessions)} sessões criadas automaticamente (1x/semana)
                </span>
              </div>
            )}
          </div>

          {/* UNIDADE */}
          {canMultiUnit && (
            <div>
              <label style={labelS}>Unidade</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={{ ...fieldS, cursor: 'pointer' }}>
                {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}

          {/* OBSERVAÇÕES */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelS}>Observações</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...fieldS, height: 'auto', minHeight: 60, padding: '12px 14px', resize: 'vertical' }} placeholder="Notas adicionais..." />
          </div>
        </div>

        {/* ── Buttons ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
          <div>
            {editingId && (
              <button onClick={() => { onDelete(editingId); onClose(); }} style={{ ...btnPrimary, background: 'linear-gradient(135deg, #ef4444, #f87171)', padding: '10px 16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span> Excluir
              </button>
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

/* ──────────── Professional Modal ──────────── */
interface ProfModalProps {
  profForm: ProfForm; setProfForm: (f: ProfForm) => void;
  onSave: () => void;
  onClose: () => void;
}

export function ProfissionalModal({ profForm, setProfForm, onSave, onClose }: ProfModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...cardS, padding: 28, width: '90%', maxWidth: 400, animation: 'fadeInScale 0.25s ease-out' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 20 }}>Novo Profissional</h2>
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
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Unidade</label>
              <select value={profForm.unit} onChange={e => setProfForm({ ...profForm, unit: e.target.value })} style={{ ...fieldS, cursor: 'pointer' }}>
                {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={onSave} disabled={!profForm.name} style={{ ...btnPrimary, opacity: !profForm.name ? 0.5 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Criar
          </button>
        </div>
      </div>
    </div>
  );
}
