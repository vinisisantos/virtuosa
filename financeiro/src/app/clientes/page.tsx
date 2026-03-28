'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  cpf: string | null; birthdate: string | null; gender: string | null;
  unit: string; notes: string | null; tags: string | null;
  totalSpent: number; visitCount: number; lastVisit: string | null;
  isActive: boolean; createdAt: string;
}

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Form state
  const [form, setForm] = useState({ name: '', phone: '', email: '', cpf: '', birthdate: '', gender: '', unit: 'Barueri', notes: '', tags: '' });

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (unitFilter !== 'all') params.set('unit', unitFilter);
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      setClients(data.clients || []);
      setTotal(data.total || 0);
    } catch { setClients([]); }
    finally { setLoading(false); }
  }, [search, unitFilter]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const openNew = () => { setEditingClient(null); setForm({ name: '', phone: '', email: '', cpf: '', birthdate: '', gender: '', unit: 'Barueri', notes: '', tags: '' }); setShowModal(true); };
  const openEdit = (c: Client) => { setEditingClient(c); setForm({ name: c.name, phone: c.phone || '', email: c.email || '', cpf: c.cpf || '', birthdate: c.birthdate || '', gender: c.gender || '', unit: c.unit, notes: c.notes || '', tags: c.tags || '' }); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast('Nome obrigatório', 'error'); return; }
    try {
      const method = editingClient ? 'PUT' : 'POST';
      const body = editingClient ? { id: editingClient.id, ...form } : form;
      const res = await fetch('/api/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { toast(editingClient ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'success'); setShowModal(false); fetchClients(); }
      else toast('Erro ao salvar', 'error');
    } catch { toast('Erro de conexão', 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Desativar este cliente?')) return;
    try {
      await fetch('/api/clients', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      toast('Cliente desativado', 'success'); fetchClients(); setSelectedClient(null);
    } catch { toast('Erro ao remover', 'error'); }
  };

  const getInitials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const getColor = (name: string) => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#e600a0', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
    let hash = 0; for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  // Stats
  const totalClients = clients.length;
  const activeThisMonth = clients.filter(c => c.lastVisit && new Date(c.lastVisit).getMonth() === new Date().getMonth()).length;
  const avgSpent = totalClients > 0 ? clients.reduce((s, c) => s + c.totalSpent, 0) / totalClients : 0;

  return (
    <AuthGuard requiredPermission="dashboard">
      <AppHeader /><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '30px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>people</span> CRM de Clientes
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gestão completa da base de clientes</p>
          </div>
          <button onClick={openNew} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_add</span> Novo Cliente
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'groups', color: '#6366f1', label: 'Total Clientes', value: String(totalClients) },
            { icon: 'calendar_month', color: '#10b981', label: 'Ativos este Mês', value: String(activeThisMonth) },
            { icon: 'payments', color: '#f59e0b', label: 'Gasto Médio', value: fmt(avgSpent) },
          ].map(kpi => (
            <div key={kpi.label} style={{ ...cardS, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: kpi.color }}>{kpi.icon}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search + Filters */}
        <div style={{ ...cardS, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', padding: '14px 20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--text-muted)' }}>search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, e-mail ou CPF..." style={{ ...inputS, paddingLeft: 42 }} />
          </div>
          <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} style={{ ...inputS, width: 'auto', minWidth: 140 }}>
            <option value="all">Todas Unidades</option>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {/* Client list */}
        <div style={{ display: 'flex', gap: 20 }}>
          {/* List (left) */}
          <div style={{ flex: 1 }}>
            {loading ? (
              <div style={cardS}><div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div></div>
            ) : clients.length === 0 ? (
              <div style={cardS}>
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--text-muted)', opacity: 0.3 }}>person_off</span>
                  <p style={{ fontWeight: 700, color: 'var(--text-muted)', marginTop: 12 }}>{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</p>
                  {!search && <button onClick={openNew} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cadastrar Primeiro Cliente</button>}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clients.map(c => {
                  const color = getColor(c.name);
                  const isSelected = selectedClient?.id === c.id;
                  return (
                    <div key={c.id} onClick={() => setSelectedClient(c)} style={{
                      ...cardS, padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
                      border: isSelected ? `2px solid ${color}` : '1px solid var(--border)',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.88rem', flexShrink: 0 }}>
                        {getInitials(c.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                          {c.phone && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📱 {c.phone}</span>}
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📍 {c.unit}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color }}>{fmt(c.totalSpent)}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.visitCount} visitas</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail panel (right) */}
          {selectedClient && (
            <div style={{ width: 360, flexShrink: 0 }}>
              <div style={cardS}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 18, background: `linear-gradient(135deg, ${getColor(selectedClient.name)}, ${getColor(selectedClient.name)}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '1.3rem', margin: '0 auto 12px' }}>
                    {getInitials(selectedClient.name)}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>{selectedClient.name}</div>
                  {selectedClient.tags && (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                      {selectedClient.tags.split(',').map(t => (
                        <span key={t} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'var(--primary)', color: '#fff' }}>{t.trim()}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>{fmt(selectedClient.totalSpent)}</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Gasto</div>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#6366f1' }}>{selectedClient.visitCount}</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>Visitas</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedClient.phone && <InfoRow icon="phone" label="Telefone" value={selectedClient.phone} />}
                  {selectedClient.email && <InfoRow icon="mail" label="E-mail" value={selectedClient.email} />}
                  {selectedClient.cpf && <InfoRow icon="badge" label="CPF" value={selectedClient.cpf} />}
                  {selectedClient.birthdate && <InfoRow icon="cake" label="Nascimento" value={selectedClient.birthdate} />}
                  {selectedClient.gender && <InfoRow icon="person" label="Gênero" value={selectedClient.gender} />}
                  <InfoRow icon="location_on" label="Unidade" value={selectedClient.unit} />
                  {selectedClient.lastVisit && <InfoRow icon="schedule" label="Última Visita" value={new Date(selectedClient.lastVisit).toLocaleDateString('pt-BR')} />}
                  {selectedClient.notes && (
                    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', marginTop: 4 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>OBSERVAÇÕES</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.5 }}>{selectedClient.notes}</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {selectedClient.phone && (
                    <button onClick={() => {
                      const cleanPhone = (selectedClient.phone || '').replace(/\D/g, '');
                      const phoneNum = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
                      const msg = encodeURIComponent(`Olá ${selectedClient.name.split(' ')[0]}! 😊\nAqui é da Virtuosa Estética. Como posso ajudá-la?`);
                      window.open(`https://wa.me/${phoneNum}?text=${msg}`, '_blank');
                    }} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      💬 WhatsApp
                    </button>
                  )}
                  <button onClick={() => openEdit(selectedClient)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span> Editar
                  </button>
                  <button onClick={() => handleDelete(selectedClient.id)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowModal(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: '32px', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>person_add</span>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelS}>Nome Completo *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputS} required /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelS}>Telefone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" style={inputS} /></div>
                <div><label style={labelS}>E-mail</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" style={inputS} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelS}>CPF</label><input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" style={inputS} /></div>
                <div><label style={labelS}>Nascimento</label><input value={form.birthdate} onChange={e => setForm({ ...form, birthdate: e.target.value })} type="date" style={inputS} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelS}>Gênero</label>
                  <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} style={inputS}>
                    <option value="">Selecionar</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option><option value="outro">Outro</option>
                  </select>
                </div>
                <div><label style={labelS}>Unidade</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputS}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div><label style={labelS}>Tags (separadas por vírgula)</label><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="VIP, Pacote, Recorrente" style={inputS} /></div>
              <div><label style={labelS}>Observações</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inputS, height: 'auto', resize: 'vertical' }} /></div>
            </div>

            <button type="submit" style={{ width: '100%', marginTop: 20, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {editingClient ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </button>
          </form>
        </div>
      )}
    </AuthGuard>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', width: 80 }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{value}</span>
    </div>
  );
}
