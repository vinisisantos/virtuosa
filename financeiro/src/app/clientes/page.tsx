'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import { useGlobalUnit } from '@/contexts/UnitContext';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { DatePicker } from '@/components/ui/date-picker';
import { confirmDialog } from '@/components/ui/confirm-dialog';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  cpf: string | null; birthdate: string | null; gender: string | null;
  unit: string; notes: string | null; tags: string | null;
  totalSpent: number; visitCount: number; lastVisit: string | null;
  isActive: boolean; stage: string; source: string | null;
  followUpDate: string | null; packageValue: number | null; createdAt: string;
}


const SOURCES = [
  { key: 'instagram', label: 'Instagram', icon: '📸' },
  { key: 'indicacao', label: 'Indicação', icon: '🤝' },
  { key: 'google', label: 'Google', icon: '🔍' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'site', label: 'Site', icon: '🌐' },
  { key: 'outro', label: 'Outro', icon: '📋' },
];
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
};

const STAGES: { key: string; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'entrada', label: 'Entrada', icon: 'person_add', color: '#6366f1', bg: 'rgba(99,102,241,0.06)' },
  { key: 'em_andamento', label: 'Em Andamento', icon: 'trending_up', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
  { key: 'avaliacao', label: 'Avaliação', icon: 'rate_review', color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)' },
  { key: 'venda', label: 'Venda', icon: 'check_circle', color: '#10b981', bg: 'rgba(16,185,129,0.06)' },
  { key: 'nao_venda', label: 'Não Venda', icon: 'cancel', color: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
];

const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const };

export default function ClientesPage() {
  const { units: UNITS, globalUnit } = useGlobalUnit();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [unitFilter, setUnitFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Name autocomplete state ──
  const [nameSuggestions, setNameSuggestions] = useState<Client[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [nameSearching, setNameSearching] = useState(false);
  const nameDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const nameContainerRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({ name: '', phone: '', email: '', cpf: '', birthdate: '', gender: '', unit: '', notes: '', tags: '', stage: 'entrada', source: '', followUpDate: '', packageValue: '' });

  // Set initial unit filter to globalUnit
  useEffect(() => {
    if (UNITS.length === 1) {
      setUnitFilter(UNITS[0]);
    } else if (!unitFilter && globalUnit) {
      setUnitFilter(globalUnit);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [UNITS, globalUnit]);

  // Set default form unit
  useEffect(() => {
    setForm(prev => ({ ...prev, unit: prev.unit || UNITS[0] || 'Barueri' }));
  }, [UNITS]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (unitFilter) params.set('unit', unitFilter);
      params.set('limit', '500');
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      // Extra safety: filter out clients from unauthorized units
      const allowedSet = new Set(UNITS);
      const filtered = (data.clients || []).filter((c: Client) => allowedSet.has(c.unit));
      setClients(filtered);
    } catch { setClients([]); }
    finally { setLoading(false); }
  }, [search, unitFilter, UNITS]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // ── Click outside to close name suggestions ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (nameContainerRef.current && !nameContainerRef.current.contains(e.target as Node)) {
        setShowNameSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Debounced name search for autocomplete ──
  const searchByName = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setNameSuggestions([]); return; }
    setNameSearching(true);
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(q.trim())}&limit=8`);
      const data = await res.json();
      setNameSuggestions(data.clients || []);
    } catch { setNameSuggestions([]); }
    setNameSearching(false);
  }, []);

  const handleNameInput = (text: string) => {
    setForm(prev => ({ ...prev, name: text }));
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      searchByName(text);
      if (text.trim().length >= 2) setShowNameSuggestions(true);
      else setShowNameSuggestions(false);
    }, 300);
  };

  const selectSuggestion = (c: Client) => {
    setForm({
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      cpf: c.cpf || '',
      birthdate: c.birthdate || '',
      gender: c.gender || '',
      unit: c.unit || UNITS[0] || 'Barueri',
      notes: c.notes || '',
      tags: c.tags || '',
      stage: c.stage || 'entrada',
      source: c.source || '',
      followUpDate: c.followUpDate ? c.followUpDate.split('T')[0] : '',
      packageValue: c.packageValue?.toString() || '',
    });
    setEditingClient(c as Client);
    setShowNameSuggestions(false);
    toast('Dados do cliente preenchidos automaticamente!', 'success');
  };

  const openNew = (stage = 'entrada') => { setEditingClient(null); setForm({ name: '', phone: '', email: '', cpf: '', birthdate: '', gender: '', unit: UNITS[0] || 'Barueri', notes: '', tags: '', stage, source: '', followUpDate: '', packageValue: '' }); setShowModal(true); setShowNameSuggestions(false); };
  const openEdit = (c: Client) => { setEditingClient(c); setForm({ name: c.name, phone: c.phone || '', email: c.email || '', cpf: c.cpf || '', birthdate: c.birthdate || '', gender: c.gender || '', unit: c.unit, notes: c.notes || '', tags: c.tags || '', stage: c.stage || 'entrada', source: c.source || '', followUpDate: c.followUpDate ? c.followUpDate.split('T')[0] : '', packageValue: c.packageValue?.toString() || '' }); setShowModal(true); setShowNameSuggestions(false); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast('Nome obrigatório', 'error'); return; }
    const method = editingClient ? 'PUT' : 'POST';
    const body = editingClient ? { id: editingClient.id, ...form } : form;
    const res = await fetch('/api/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { toast(editingClient ? 'Atualizado!' : 'Lead cadastrado!', 'success'); setShowModal(false); fetchClients(); }
  };

  const moveClient = async (clientId: string, newStage: string) => {
    // Optimistic update
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, stage: newStage } : c));
    await fetch('/api/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: clientId, stage: newStage }) });
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Desativar Lead', message: 'Desativar este lead? Ele não aparecerá mais na lista.', confirmText: 'Sim, desativar', variant: 'warning' })) return;
    await fetch('/api/clients', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    toast('Lead removido', 'success'); setSelectedClient(null); fetchClients();
  };

  // Drag handlers
  const onDragStart = (e: React.DragEvent, id: string) => { setDraggedId(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (e: React.DragEvent, stage: string) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(stage); };
  const onDragLeave = () => { setDragOverStage(null); };
  const onDrop = (e: React.DragEvent, stage: string) => { e.preventDefault(); setDragOverStage(null); if (draggedId) { moveClient(draggedId, stage); setDraggedId(null); } };

  const getInitials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const getColor = (name: string) => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#e600a0', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
    let hash = 0; for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const filteredClients = search ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase())) : clients;
  const getByStage = (stage: string) => filteredClients.filter(c => (c.stage || 'entrada') === stage);

  return (
    <AuthGuard requiredPermission="dashboard">
      <AppHeader activePage="clientes" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '20px 24px', height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--primary)' }}>view_kanban</span> CRM — Pipeline de Leads
            </h1>
            <p data-tour="crm-kpis" style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{filteredClients.length} leads no funil</p>
          </div>
          <div data-tour="crm-filtros" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {UNITS.length > 1 && (
              <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} style={{ ...inputS, width: 'auto', minWidth: 150, height: 42 }}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-muted)' }}>search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead..." style={{ ...inputS, paddingLeft: 38, width: 220, height: 42 }} />
            </div>
            <button onClick={() => openNew()} style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, height: 42 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span> Novo Lead
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <div data-tour="crm-pipeline" ref={scrollRef} style={{ flex: 1, display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8 }}>
          {STAGES.map(stage => {
            const stageClients = getByStage(stage.key);
            const isDragTarget = dragOverStage === stage.key;
            return (
              <div
                key={stage.key}
                onDragOver={e => onDragOver(e, stage.key)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, stage.key)}
                style={{
                  flex: '1 0 260px', minWidth: 260, maxWidth: 320, display: 'flex', flexDirection: 'column',
                  background: isDragTarget ? stage.bg : 'var(--bg)', borderRadius: 16,
                  border: isDragTarget ? `2px dashed ${stage.color}` : '1px solid var(--border)',
                  transition: 'all 0.15s',
                }}
              >
                {/* Column header */}
                <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${stage.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: stage.color }}>{stage.icon}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)' }}>{stage.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: stage.bg, color: stage.color }}>{stageClients.length}</span>
                    <button onClick={() => openNew(stage.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>add</span>
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {loading && stageClients.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.78rem' }}>Carregando...</div>
                  ) : stageClients.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-muted)', fontSize: '0.75rem', opacity: 0.5 }}>
                      Arraste leads para cá
                    </div>
                  ) : (
                    stageClients.map(c => {
                      const color = getColor(c.name);
                      const isDragging = draggedId === c.id;
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={e => onDragStart(e, c.id)}
                          onClick={() => setSelectedClient(c)}
                          style={{
                            background: 'var(--card-bg)', borderRadius: 12, padding: '12px 14px',
                            border: '1px solid var(--border)', cursor: 'grab',
                            opacity: isDragging ? 0.4 : 1, transition: 'all 0.15s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          }}
                          onMouseEnter={e => { if (!isDragging) e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
                        >
                          {/* Card header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.68rem', flexShrink: 0 }}>
                              {getInitials(c.name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                            </div>
                          </div>

                          {/* Card info */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {c.phone && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><span className="material-symbols-outlined" style={{ fontSize: 12 }}>phone</span>{fmtPhone(c.phone)}</div>}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><span className="material-symbols-outlined" style={{ fontSize: 12 }}>location_on</span>{c.unit}</div>
                            {c.packageValue && c.packageValue > 0 && <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}><span className="material-symbols-outlined" style={{ fontSize: 12 }}>payments</span>{fmt(c.packageValue)}</div>}
                            {c.totalSpent > 0 && <div style={{ fontSize: '0.7rem', fontWeight: 700, color }}>{fmt(c.totalSpent)}</div>}
                          </div>

                          {/* Source + Follow-up badges */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {c.source && (() => { const src = SOURCES.find(s => s.key === c.source); return src ? <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>{src.icon} {src.label}</span> : null; })()}
                            {c.followUpDate && (() => { const fd = new Date(c.followUpDate); const isOverdue = fd < new Date(); return <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: isOverdue ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', color: isOverdue ? '#ef4444' : '#f59e0b' }}>📅 {fd.toLocaleDateString('pt-BR')}</span>; })()}
                          </div>

                          {/* Tags */}
                          {c.tags && (
                            <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
                              {c.tags.split(',').slice(0, 3).map(t => (
                                <span key={t} style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${color}14`, color }}>{t.trim()}</span>
                              ))}
                            </div>
                          )}

                          {/* Quick actions */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                            {c.phone && (
                              <button onClick={e => { e.stopPropagation(); const p = (c.phone || '').replace(/\D/g, ''); window.open(`https://wa.me/${p.startsWith('55') ? p : '55' + p}`, '_blank'); }} style={{ background: '#25d366', border: 'none', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', lineHeight: 1 }}>
                                <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 700 }}>💬</span>
                              </button>
                            )}
                            <button onClick={e => { e.stopPropagation(); openEdit(c); }} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', lineHeight: 1 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-muted)' }}>edit</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedClient && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelectedClient(null)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: 380, background: 'var(--card-bg)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(0,0,0,0.1)', overflowY: 'auto', padding: 28, animation: 'slideInRight 0.2s ease-out' }}>
            <button onClick={() => setSelectedClient(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined">close</span>
            </button>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${getColor(selectedClient.name)}, ${getColor(selectedClient.name)}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '1.2rem', margin: '0 auto 10px' }}>
                {getInitials(selectedClient.name)}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{selectedClient.name}</div>
              {selectedClient.tags && (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  {selectedClient.tags.split(',').map(t => (
                    <span key={t} style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: 'var(--primary)', color: '#fff' }}>{t.trim()}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Stage selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 6 }}>Etapa do Funil</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {STAGES.map(s => (
                  <button key={s.key} onClick={() => { moveClient(selectedClient.id, s.key); setSelectedClient({ ...selectedClient, stage: s.key }); }}
                    style={{
                      padding: '5px 10px', borderRadius: 8, border: (selectedClient.stage || 'entrada') === s.key ? `2px solid ${s.color}` : '1px solid var(--border)',
                      background: (selectedClient.stage || 'entrada') === s.key ? s.bg : 'var(--bg)', cursor: 'pointer',
                      fontSize: '0.7rem', fontWeight: 700, color: (selectedClient.stage || 'entrada') === s.key ? s.color : 'var(--text-muted)', fontFamily: 'inherit',
                    }}
                  >{s.label}</button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#10b981' }}>{fmt(selectedClient.totalSpent)}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Gasto</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#6366f1' }}>{selectedClient.visitCount}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>Visitas</div>
              </div>
            </div>

            {/* Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedClient.phone && <InfoRow icon="phone" label="Telefone" value={fmtPhone(selectedClient.phone)} />}
              {selectedClient.email && <InfoRow icon="mail" label="E-mail" value={selectedClient.email} />}
              {selectedClient.cpf && <InfoRow icon="badge" label="CPF" value={selectedClient.cpf} />}
              {selectedClient.birthdate && <InfoRow icon="cake" label="Nascimento" value={selectedClient.birthdate} />}
              <InfoRow icon="location_on" label="Unidade" value={selectedClient.unit} />
              {selectedClient.source && (() => { const src = SOURCES.find(s => s.key === selectedClient.source); return src ? <InfoRow icon="campaign" label="Origem" value={`${src.icon} ${src.label}`} /> : null; })()}
              {selectedClient.followUpDate && <InfoRow icon="event" label="Follow-up" value={new Date(selectedClient.followUpDate).toLocaleDateString('pt-BR')} />}
              {selectedClient.packageValue && selectedClient.packageValue > 0 && <InfoRow icon="payments" label="Valor Pacote" value={fmt(selectedClient.packageValue)} />}
              {selectedClient.lastVisit && <InfoRow icon="schedule" label="Última Visita" value={new Date(selectedClient.lastVisit).toLocaleDateString('pt-BR')} />}
              {selectedClient.notes && (
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', marginTop: 4 }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3 }}>OBSERVAÇÕES</div>
                  <div style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>{selectedClient.notes}</div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              {selectedClient.phone && (
                <button onClick={() => { const p = (selectedClient.phone || '').replace(/\D/g, ''); window.open(`https://wa.me/${p.startsWith('55') ? p : '55' + p}`, '_blank'); }} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
                  💬 WhatsApp
                </button>
              )}
              <button onClick={() => openEdit(selectedClient)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', color: 'var(--text-main)' }}>
                ✏️ Editar
              </button>
              <button onClick={() => handleDelete(selectedClient.id)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
                🗑️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 20 }} onClick={() => setShowModal(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>person_add</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{editingClient ? 'Editar Lead' : 'Novo Lead'}</h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* ── Nome with autocomplete ── */}
              <div ref={nameContainerRef} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ ...labelS, marginBottom: 0 }}>Nome *</label>
                  {editingClient && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.08)', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>check_circle</span>
                      Vinculado
                    </span>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: editingClient ? '#10b981' : 'var(--text-muted)', transition: 'color 0.2s' }}>
                    {editingClient ? 'person_check' : 'person_search'}
                  </span>
                  <input
                    value={form.name}
                    onChange={e => handleNameInput(e.target.value)}
                    onFocus={() => { if (form.name.trim().length >= 2 && !editingClient) { searchByName(form.name); setShowNameSuggestions(true); } }}
                    style={{
                      ...inputS,
                      paddingLeft: 38,
                      borderColor: editingClient ? 'rgba(16,185,129,0.3)' : showNameSuggestions ? 'var(--primary)' : 'var(--border)',
                      boxShadow: showNameSuggestions ? '0 0 0 3px rgba(230,0,126,0.08)' : 'none',
                      transition: 'all 0.2s',
                    }}
                    placeholder="Nome Sobrenome"
                    autoComplete="off"
                    required
                  />
                  {form.name && (
                    <button type="button" onClick={() => { setForm(prev => ({ ...prev, name: '' })); setEditingClient(null); setShowNameSuggestions(false); setNameSuggestions([]); }}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                  )}
                </div>

                {/* Dropdown suggestions */}
                {showNameSuggestions && !editingClient && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--card-bg)', border: '1px solid var(--border)',
                    borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                    maxHeight: 280, overflowY: 'auto', marginTop: 4,
                  }}>
                    {nameSearching && (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 6 }}>progress_activity</span>
                        Buscando...
                      </div>
                    )}
                    {!nameSearching && nameSuggestions.length > 0 && nameSuggestions.map(c => {
                      const color = getColor(c.name);
                      return (
                        <div key={c.id}
                          onMouseDown={e => { e.preventDefault(); selectSuggestion(c); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 900, flexShrink: 0 }}>
                            {getInitials(c.name)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {c.phone && <span>📱 {fmtPhone(c.phone)}</span>}
                              {c.cpf && <span>🪪 {c.cpf}</span>}
                              {c.email && <span>✉️ {c.email}</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{c.unit}</span>
                        </div>
                      );
                    })}
                    {!nameSearching && nameSuggestions.length === 0 && form.name.trim().length >= 2 && (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, opacity: 0.3, display: 'block', marginBottom: 4 }}>person_off</span>
                        Nenhum cliente encontrado — preencha os dados para criar novo
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelS}>Telefone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputS} placeholder="(00) 00000-0000" /></div>
                <div><label style={labelS}>E-mail</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputS} type="email" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelS}>CPF</label><input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} style={inputS} /></div>
                <div><label style={labelS}>Nascimento</label><DatePicker value={form.birthdate} onChange={v => setForm({ ...form, birthdate: v })} variant="input" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelS}>Unidade</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputS}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div><label style={labelS}>Etapa</label>
                  <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} style={inputS}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelS}>Origem do Lead</label>
                  <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} style={inputS}>
                    <option value="">Selecione</option>
                    {SOURCES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
                  </select>
                </div>
                <div><label style={labelS}>Follow-up</label><DatePicker value={form.followUpDate} onChange={v => setForm({ ...form, followUpDate: v })} variant="input" /></div>
              </div>
              <div><label style={labelS}>Valor Pacote (R$)</label><input value={form.packageValue} onChange={e => setForm({ ...form, packageValue: e.target.value })} type="number" step="0.01" style={inputS} placeholder="0,00" /></div>
              <div><label style={labelS}>Tags</label><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} style={inputS} placeholder="VIP, Pacote, Recorrente" /></div>
              <div><label style={labelS}>Observações</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inputS, height: 'auto', resize: 'vertical' }} /></div>
            </div>
            <button type="submit" style={{ width: '100%', marginTop: 20, padding: 14, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {editingClient ? 'Salvar Alterações' : 'Cadastrar Lead'}
            </button>
          </form>
        </div>
      )}

      <style jsx global>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </AuthGuard>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', width: 70 }}>{label}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{value}</span>
    </div>
  );
}
