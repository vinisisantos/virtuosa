'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface ServiceLine { name: string; quantity: number; unitPrice: number; discount: number; profissional: string; }
interface Package {
  id: string; clientName: string; clientId: string | null;
  services: string; totalValue: number; paidValue: number;
  paymentMethod: string; installments: number;
  totalSessions: number; completedSessions: number;
  status: string; unit: string; notes: string | null; createdAt: string;
}
interface CatalogService { id: string; name: string; price: number; duration: number; category: string; }
interface CrmClient { id: string; name: string; phone: string | null; email: string | null; cpf: string | null; gender: string | null; birthdate: string | null; }
interface Profissional { id: string; name: string; color: string; unit: string; }

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const METHODS: Record<string, string> = { pix: '⚡ PIX', credito: '💳 Crédito', debito: '💳 Débito', dinheiro: '💵 Dinheiro', link: '🔗 Link de Pagamento' };
const CATEGORIES = ['Receitas de serviços', 'Pacote promocional', 'Tratamento estético', 'Depilação', 'Corporal', 'Facial', 'Capilar', 'Outro'];
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Ativo', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  concluido: { label: 'Concluído', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  cancelado: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
};
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.88rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 46 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const };
const sectionS: React.CSSProperties = { background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, marginBottom: 16 };

export default function PacotesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [stats, setStats] = useState({ total: 0, ativos: 0, concluidos: 0, totalValue: 0, totalPaid: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);

  // Form state
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [categoria, setCategoria] = useState('Receitas de serviços');
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().split('T')[0]);
  const [descricao, setDescricao] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([{ name: '', quantity: 1, unitPrice: 0, discount: 0, profissional: '' }]);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [installments, setInstallments] = useState('1');
  const [unit, setUnit] = useState('Barueri');
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clientDropdown, setClientDropdown] = useState(false);

  // Autocomplete data
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [crmClients, setCrmClients] = useState<CrmClient[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);

  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(d => setCatalogServices(d.services || [])).catch(() => {});
    fetch('/api/clients?limit=1000').then(r => r.json()).then(d => setCrmClients((d.clients || []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, cpf: c.cpf, gender: c.gender, birthdate: c.birthdate })))).catch(() => {});
    fetch('/api/profissionais').then(r => r.json()).then(d => setProfissionais(d || [])).catch(() => {});
  }, []);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/packages?${params}`);
    const data = await res.json();
    setPackages(data.packages || []);
    setStats(data.stats || {});
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const totalValue = serviceLines.reduce((s, l) => {
    const lineTotal = l.quantity * l.unitPrice - l.discount * l.quantity;
    return s + Math.max(0, lineTotal);
  }, 0);
  const totalSessions = serviceLines.reduce((s, l) => s + l.quantity, 0);

  const resetForm = () => {
    setClientName(''); setClientId(''); setVendedor(''); setCategoria('Receitas de serviços');
    setDataVenda(new Date().toISOString().split('T')[0]); setDescricao(''); setDataValidade('');
    setServiceLines([{ name: '', quantity: 1, unitPrice: 0, discount: 0, profissional: '' }]);
    setPaymentMethod('pix'); setInstallments('1'); setUnit('Barueri'); setNotes('');
    setEditingPkg(null); setShowAdvanced(false);
  };

  const openNew = () => { resetForm(); setShowModal(true); };
  const openEdit = (pkg: Package) => {
    setEditingPkg(pkg);
    setClientName(pkg.clientName);
    setClientId(pkg.clientId || '');
    try {
      const parsed = JSON.parse(pkg.services);
      setServiceLines(parsed.map((s: any) => ({ name: s.name, quantity: s.quantity, unitPrice: s.unitPrice, discount: s.discount || 0, profissional: s.profissional || '' })));
    } catch { setServiceLines([{ name: '', quantity: 1, unitPrice: 0, discount: 0, profissional: '' }]); }
    setPaymentMethod(pkg.paymentMethod);
    setInstallments(String(pkg.installments));
    setUnit(pkg.unit);
    setNotes(pkg.notes || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!clientName.trim()) { toast('Nome do cliente obrigatório', 'error'); return; }
    const validLines = serviceLines.filter(l => l.name.trim());
    if (validLines.length === 0) { toast('Adicione pelo menos um serviço', 'error'); return; }

    const body = {
      ...(editingPkg && { id: editingPkg.id }),
      clientName, clientId: clientId || null,
      services: validLines, totalValue, totalSessions,
      paymentMethod, installments: parseInt(installments),
      unit, notes: notes || null,
      ...(editingPkg ? {} : { paidValue: 0, completedSessions: 0 }),
    };

    const method = editingPkg ? 'PUT' : 'POST';
    const res = await fetch('/api/packages', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast(editingPkg ? 'Pacote atualizado!' : 'Pacote criado!', 'success');
      setShowModal(false); resetForm(); fetchPackages();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este pacote?')) return;
    await fetch(`/api/packages?id=${id}`, { method: 'DELETE' });
    toast('Pacote removido', 'success'); fetchPackages();
  };

  const markSession = async (pkg: Package) => {
    const newCompleted = Math.min(pkg.completedSessions + 1, pkg.totalSessions);
    const newStatus = newCompleted >= pkg.totalSessions ? 'concluido' : 'ativo';
    await fetch('/api/packages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pkg.id, completedSessions: newCompleted, status: newStatus }) });
    toast(`Sessão ${newCompleted}/${pkg.totalSessions} registrada!`, 'success'); fetchPackages();
  };

  const addLine = () => setServiceLines([...serviceLines, { name: '', quantity: 1, unitPrice: 0, discount: 0, profissional: '' }]);
  const removeLine = (i: number) => setServiceLines(serviceLines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof ServiceLine, value: string | number) => {
    const lines = [...serviceLines];
    if (field === 'name') {
      lines[i].name = value as string;
      const svc = catalogServices.find(s => s.name === value);
      if (svc) lines[i].unitPrice = svc.price;
    } else if (field === 'profissional') {
      lines[i].profissional = value as string;
    } else {
      (lines[i] as any)[field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
    }
    setServiceLines(lines);
  };

  const handleClientSelect = (name: string) => {
    setClientName(name);
    setClientDropdown(true);
    const client = crmClients.find(c => c.name === name);
    if (client) {
      setClientId(client.id);
      if (!descricao) setDescricao(`Pacote para ${name}`);
      setClientDropdown(false);
    }
  };
  const selectClient = (c: CrmClient) => {
    setClientName(c.name);
    setClientId(c.id);
    if (!descricao) setDescricao(`Pacote para ${c.name}`);
    setClientDropdown(false);
  };
  const filteredClients = clientName.trim().length >= 2
    ? crmClients.filter(c => c.name.toLowerCase().includes(clientName.toLowerCase()) || (c.phone || '').includes(clientName) || (c.cpf || '').includes(clientName)).slice(0, 8)
    : [];

  return (
    <AuthGuard>
      <AppHeader activePage="pacotes" />
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>inventory_2</span>
              Pacotes Fechados
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gerencie pacotes de serviços vendidos</p>
          </div>
          <button onClick={openNew} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span> Novo Pacote
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'inventory_2', color: '#6366f1', label: 'Total Pacotes', value: String(stats.total) },
            { icon: 'check_circle', color: '#10b981', label: 'Ativos', value: String(stats.ativos) },
            { icon: 'verified', color: '#8b5cf6', label: 'Concluídos', value: String(stats.concluidos) },
            { icon: 'payments', color: '#f59e0b', label: 'Valor Total', value: fmt(stats.totalValue) },
            { icon: 'account_balance', color: '#10b981', label: 'Recebido', value: fmt(stats.totalPaid) },
          ].map(kpi => (
            <div key={kpi.label} style={{ ...cardS, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: kpi.color }}>{kpi.icon}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['', 'ativo', 'concluido', 'cancelado'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '8px 16px', borderRadius: 10, border: statusFilter === s ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: statusFilter === s ? 'var(--primary)' : 'var(--card-bg)', color: statusFilter === s ? '#fff' : 'var(--text-main)',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
            }}>{s ? (STATUS_MAP[s]?.label || s) : 'Todos'}</button>
          ))}
        </div>

        {/* Package List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ ...cardS, textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div>
          ) : packages.length === 0 ? (
            <div style={{ ...cardS, textAlign: 'center', padding: '40px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3 }}>inventory_2</span>
              <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>Nenhum pacote encontrado</p>
            </div>
          ) : packages.map(pkg => {
            const services: ServiceLine[] = (() => { try { return JSON.parse(pkg.services); } catch { return []; } })();
            const st = STATUS_MAP[pkg.status] || STATUS_MAP.ativo;
            const progress = pkg.totalSessions > 0 ? (pkg.completedSessions / pkg.totalSessions) * 100 : 0;
            return (
              <div key={pkg.id} style={{ ...cardS, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)' }}>{pkg.clientName}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color }}>{st.label}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>{pkg.unit}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {services.map((s, i) => (
                        <span key={i} style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.06)', color: '#6366f1' }}>
                          {s.name} × {s.quantity}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', borderRadius: 4, background: progress >= 100 ? '#10b981' : 'linear-gradient(90deg, var(--primary), #ff4db1)', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {pkg.completedSessions}/{pkg.totalSessions} sessões
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)' }}>{fmt(pkg.totalValue)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {METHODS[pkg.paymentMethod] || pkg.paymentMethod} • {pkg.installments}x
                    </div>
                    {pkg.paidValue > 0 && <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>Pago: {fmt(pkg.paidValue)}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {pkg.status === 'ativo' && (
                        <button onClick={() => markSession(pkg)} title="Registrar sessão" style={{
                          padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.1)',
                          color: '#10b981', cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_task</span> Sessão
                        </button>
                      )}
                      <button onClick={() => openEdit(pkg)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>edit</span>
                      </button>
                      <button onClick={() => handleDelete(pkg.id)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ═══════════ CREATE/EDIT MODAL ═══════════ */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => { setShowModal(false); resetForm(); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 0, maxWidth: 780, width: '100%', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 10, borderRadius: '24px 24px 0 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>inventory_2</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{editingPkg ? 'Editar Pacote' : 'Nova venda de pacote'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            <div style={{ padding: '20px 28px' }}>
              {/* ──── SECTION 1: Client & Sale Info ──── */}
              <div style={sectionS}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {/* Cliente */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ ...labelS, marginBottom: 0 }}>Cliente *</label>
                      {clientId && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.08)', padding: '2px 8px', borderRadius: 6 }}>✓ Vinculado</span>}
                    </div>
                    <input value={clientName}
                      onChange={e => { handleClientSelect(e.target.value); }}
                      onFocus={() => { if (clientName.trim().length >= 2) setClientDropdown(true); }}
                      onBlur={() => setTimeout(() => setClientDropdown(false), 200)}
                      style={inputS} placeholder="Digite o nome do paciente..." autoComplete="off" />
                    {/* Autocomplete dropdown */}
                    {clientDropdown && filteredClients.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
                        {filteredClients.map(c => (
                          <div key={c.id} onMouseDown={() => selectClient(c)}
                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #e600a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 900, flexShrink: 0 }}>
                              {c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: 8 }}>
                                {c.phone && <span>📱 {c.phone}</span>}
                                {c.cpf && <span>🪪 {c.cpf}</span>}
                                {c.email && <span>✉️ {c.email}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Vendedor */}
                  <div>
                    <label style={labelS}>Vendedor *</label>
                    <select value={vendedor} onChange={e => setVendedor(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                      <option value="">Selecione</option>
                      {profissionais.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                      {UNITS.map(u => <option key={`unit-${u}`} value={`Virtuosa ${u}`}>Virtuosa {u}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {/* Categoria */}
                  <div>
                    <label style={labelS}>Categoria *</label>
                    <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {/* Data da venda */}
                  <div>
                    <label style={labelS}>Data da venda *</label>
                    <input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} style={inputS} />
                  </div>
                  {/* Descrição */}
                  <div>
                    <label style={labelS}>Descrição *</label>
                    <input value={descricao} onChange={e => setDescricao(e.target.value)} style={inputS} placeholder={`Pacote para ${clientName || '...'}`} />
                  </div>
                </div>

                {/* Toggle advanced options */}
                <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', padding: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                  {showAdvanced ? 'Ocultar' : 'Mostrar'} opções avançadas
                </button>

                {showAdvanced && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelS}>Pagamento</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                        {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelS}>Parcelas</label>
                      <select value={installments} onChange={e => setInstallments(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                        {Array.from({ length: 18 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x{n > 1 && totalValue ? ` ${fmt(totalValue / n)}` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelS}>Unidade</label>
                      <select value={unit} onChange={e => setUnit(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelS}>Data validade</label>
                      <input type="date" value={dataValidade} onChange={e => setDataValidade(e.target.value)} style={inputS} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelS}>Observações</label>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputS, height: 'auto', resize: 'vertical' }} placeholder="Notas importantes sobre o pacote ou cliente" />
                    </div>
                  </div>
                )}
              </div>

              {/* ──── SECTION 2: Procedimentos/Produtos ──── */}
              <div style={sectionS}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 900 }}>Procedimentos/Produtos</h3>

                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 60px 100px 100px 100px 36px', gap: 8, marginBottom: 6, padding: '0 2px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nome</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profissional</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Qtd.</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Valor (R$)</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Desconto un.</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total (R$)</span>
                  <span />
                </div>

                {/* Service rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {serviceLines.map((line, i) => {
                    const lineTotal = Math.max(0, line.quantity * line.unitPrice - line.discount * line.quantity);
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 60px 100px 100px 100px 36px', gap: 8, alignItems: 'center' }}>
                        <input value={line.name} onChange={e => updateLine(i, 'name', e.target.value)} list="pkg-svc-list" style={{ ...inputS, height: 42, fontSize: '0.82rem' }} placeholder="Pesquise/Selecione" />
                        <select value={line.profissional} onChange={e => updateLine(i, 'profissional', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', cursor: 'pointer' }}>
                          <option value="">Pesquise/Selecione</option>
                          {profissionais.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                          {UNITS.map(u => <option key={`u-${u}`} value={`Virtuosa ${u}`}>Virtuosa {u}</option>)}
                        </select>
                        <input type="number" min={1} value={line.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} style={{ ...inputS, height: 42, textAlign: 'center', fontSize: '0.82rem', padding: '0 4px' }} />
                        <input type="number" step="0.01" value={line.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                        <input type="number" step="0.01" value={line.discount} onChange={e => updateLine(i, 'discount', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                        <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                          {lineTotal.toFixed(2)}
                        </div>
                        <button onClick={() => removeLine(i)} style={{ width: 36, height: 42, borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <datalist id="pkg-svc-list">
                  {catalogServices.map(s => <option key={s.id} value={s.name} />)}
                </datalist>

                {/* Add procedure button */}
                <button onClick={addLine} style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit', padding: '4px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Adicionar Procedimentos/Produtos
                </button>

                {/* Totals */}
                {totalValue > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>Total do Pacote: {fmt(totalValue)}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{totalSessions} sessões</span>
                  </div>
                )}

                {parseInt(installments) > 1 && totalValue > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>info</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6366f1' }}>
                      {installments}x de {fmt(totalValue / parseInt(installments))}
                    </span>
                  </div>
                )}
              </div>

              {/* ──── Action Buttons ──── */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingTop: 4 }}>
                <button onClick={() => { setShowModal(false); resetForm(); }} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem' }}>Cancelar</button>
                <button onClick={handleSave} disabled={!clientName.trim() || serviceLines.every(l => !l.name.trim())} style={{
                  padding: '12px 36px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                  color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem',
                  opacity: !clientName.trim() || serviceLines.every(l => !l.name.trim()) ? 0.5 : 1,
                }}>
                  {editingPkg ? 'Salvar' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
