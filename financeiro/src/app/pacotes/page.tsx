'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface ServiceLine { name: string; quantity: number; unitPrice: number; }
interface Package {
  id: string; clientName: string; clientId: string | null;
  services: string; totalValue: number; paidValue: number;
  paymentMethod: string; installments: number;
  totalSessions: number; completedSessions: number;
  status: string; unit: string; notes: string | null; createdAt: string;
}
interface CatalogService { id: string; name: string; price: number; duration: number; category: string; }
interface CrmClient { id: string; name: string; phone: string | null; }

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const METHODS: Record<string, string> = { pix: '⚡ PIX', credito: '💳 Crédito', debito: '💳 Débito', dinheiro: '💵 Dinheiro', link: '🔗 Link de Pagamento' };
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Ativo', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  concluido: { label: 'Concluído', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  cancelado: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
};
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const };

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
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([{ name: '', quantity: 1, unitPrice: 0 }]);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [installments, setInstallments] = useState('1');
  const [unit, setUnit] = useState('Barueri');
  const [notes, setNotes] = useState('');

  // Autocomplete data
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [crmClients, setCrmClients] = useState<CrmClient[]>([]);

  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(d => setCatalogServices(d.services || [])).catch(() => {});
    fetch('/api/clients?limit=1000').then(r => r.json()).then(d => setCrmClients((d.clients || []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })))).catch(() => {});
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

  const totalValue = serviceLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalSessions = serviceLines.reduce((s, l) => s + l.quantity, 0);

  const resetForm = () => {
    setClientName(''); setClientId(''); setServiceLines([{ name: '', quantity: 1, unitPrice: 0 }]);
    setPaymentMethod('pix'); setInstallments('1'); setUnit('Barueri'); setNotes(''); setEditingPkg(null);
  };

  const openNew = () => { resetForm(); setShowModal(true); };
  const openEdit = (pkg: Package) => {
    setEditingPkg(pkg);
    setClientName(pkg.clientName);
    setClientId(pkg.clientId || '');
    try { setServiceLines(JSON.parse(pkg.services)); } catch { setServiceLines([{ name: '', quantity: 1, unitPrice: 0 }]); }
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

  const addLine = () => setServiceLines([...serviceLines, { name: '', quantity: 1, unitPrice: 0 }]);
  const removeLine = (i: number) => setServiceLines(serviceLines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof ServiceLine, value: string | number) => {
    const lines = [...serviceLines];
    if (field === 'name') {
      lines[i].name = value as string;
      const svc = catalogServices.find(s => s.name === value);
      if (svc) lines[i].unitPrice = svc.price;
    } else {
      (lines[i] as any)[field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
    }
    setServiceLines(lines);
  };

  const handleClientSelect = (name: string) => {
    setClientName(name);
    const client = crmClients.find(c => c.name === name);
    if (client) setClientId(client.id);
  };

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
                  {/* Left info */}
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
                    {/* Progress bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', borderRadius: 4, background: progress >= 100 ? '#10b981' : 'linear-gradient(90deg, var(--primary), #ff4db1)', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {pkg.completedSessions}/{pkg.totalSessions} sessões
                      </span>
                    </div>
                  </div>

                  {/* Right info + actions */}
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => { setShowModal(false); resetForm(); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>inventory_2</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{editingPkg ? 'Editar Pacote' : 'Novo Pacote'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>

            {/* Client */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelS}>Cliente *</label>
              <input value={clientName} onChange={e => handleClientSelect(e.target.value)} list="pkg-client-list" style={inputS} placeholder="Nome do cliente" />
              <datalist id="pkg-client-list">
                {crmClients.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>

            {/* Services */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...labelS, marginBottom: 0 }}>Serviços *</label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {serviceLines.map((line, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px 32px', gap: 8, alignItems: 'end' }}>
                    <div>
                      {i === 0 && <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>SERVIÇO</label>}
                      <input value={line.name} onChange={e => updateLine(i, 'name', e.target.value)} list="pkg-svc-list" style={{ ...inputS, height: 42 }} placeholder="Selecione" />
                    </div>
                    <div>
                      {i === 0 && <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>QTD</label>}
                      <input type="number" min={1} value={line.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} style={{ ...inputS, height: 42, textAlign: 'center' }} />
                    </div>
                    <div>
                      {i === 0 && <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>VALOR UN.</label>}
                      <input type="number" step="0.01" value={line.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)} style={{ ...inputS, height: 42 }} />
                    </div>
                    <div>
                      {serviceLines.length > 1 && (
                        <button onClick={() => removeLine(i)} style={{ width: 32, height: 42, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>close</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <datalist id="pkg-svc-list">
                {catalogServices.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
              <button onClick={addLine} style={{ marginTop: 10, width: '100%', padding: '10px 16px', borderRadius: 10, border: '2px dashed var(--primary)', background: 'rgba(230,0,160,0.04)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span> Adicionar Procedimento
              </button>
              {totalValue > 0 && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10b981' }}>Total: {fmt(totalValue)}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{totalSessions} sessões</span>
                </div>
              )}
            </div>

            {/* Payment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelS}>Pagamento</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputS}>
                  {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Parcelas</label>
                <select value={installments} onChange={e => setInstallments(e.target.value)} style={inputS}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(n => <option key={n} value={n}>{n}x{n > 1 && totalValue ? ` ${fmt(totalValue / n)}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Unidade</label>
                <select value={unit} onChange={e => setUnit(e.target.value)} style={inputS}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelS}>Observações</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputS, height: 'auto', resize: 'vertical' }} placeholder="Notas importantes sobre o pacote ou cliente" />
            </div>

            {parseInt(installments) > 1 && totalValue > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>info</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6366f1' }}>
                  {installments}x de {fmt(totalValue / parseInt(installments))}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} disabled={!clientName.trim() || serviceLines.every(l => !l.name.trim())} style={{
                padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                opacity: !clientName.trim() || serviceLines.every(l => !l.name.trim()) ? 0.5 : 1,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>save</span>
                {editingPkg ? 'Salvar' : 'Criar Pacote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
