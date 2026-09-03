'use client';
import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import { useGlobalUnit } from '@/contexts/UnitContext';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { ProcedureSelector } from '@/components/procedure-selector';
import { DatePicker } from '@/components/ui/date-picker';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { PatientAutocomplete, PatientData } from '@/components/patient-autocomplete';
import { PaymentFeeSection } from '@/components/sales/payment-fee-section';
import { AdminKpiGrid, AdminPageHeader, AdminPrimaryAction } from '@/components/admin/admin-ui';
import { adminCardStyle as cardS, adminCompactInputStyle as inputS, adminLabelStyle as labelS } from '@/components/admin/admin-styles';
import { formatCurrency as fmt } from '@/lib/currency';

interface ServiceLine { name: string; quantity: number; unitPrice: number; discount: number; profissional: string; }
interface Package {
  id: string; clientName: string; clientId: string | null;
  services: string; totalValue: number; paidValue: number;
  paymentMethod: string; installments: number;
  paymentFeeConfigId: string | null; paymentProvider: string | null; paymentBrand: string | null;
  paymentFeePayer: string; paymentFeeAmount: number; chargedValue: number | null; netValue: number | null;
  installmentValues: unknown;
  totalSessions: number; completedSessions: number;
  status: string; unit: string; notes: string | null; createdAt: string;
}
interface CatalogService { id: string; name: string; price: number; duration: number; category: string; }
interface Profissional { id: string; name: string; color: string; unit: string; }


const METHODS: Record<string, string> = { pix: '⚡ PIX', credito: '💳 Crédito', debito: '💳 Débito', dinheiro: '💵 Dinheiro', link: '🔗 Link de Pagamento' };
const CATEGORIES = ['Receitas de serviços', 'Pacote promocional', 'Tratamento estético', 'Depilação', 'Corporal', 'Facial', 'Capilar', 'Outro'];
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Ativo', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  concluido: { label: 'Concluído', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  cancelado: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
};
const sectionS: React.CSSProperties = { background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, marginBottom: 16 };

function parseServiceLines(value: string): ServiceLine[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry): ServiceLine => {
      const service = typeof entry === 'object' && entry !== null ? entry as Partial<ServiceLine> : {};
      return {
        name: typeof service.name === 'string' ? service.name : '',
        quantity: typeof service.quantity === 'number' ? service.quantity : 1,
        unitPrice: typeof service.unitPrice === 'number' ? service.unitPrice : 0,
        discount: typeof service.discount === 'number' ? service.discount : 0,
        profissional: typeof service.profissional === 'string' ? service.profissional : '',
      };
    });
  } catch {
    return [];
  }
}

interface PackageCardProps {
  pkg: Package;
  onEdit: (pkg: Package) => void;
  onDelete: (id: string) => void;
  onMarkSession: (pkg: Package) => void;
}

const PackageCard = memo(function PackageCard({ pkg, onEdit, onDelete, onMarkSession }: PackageCardProps) {
  const services = useMemo(() => parseServiceLines(pkg.services), [pkg.services]);
  const status = STATUS_MAP[pkg.status] || STATUS_MAP.ativo;
  const progress = pkg.totalSessions > 0 ? (pkg.completedSessions / pkg.totalSessions) * 100 : 0;

  return (
    <div style={{ ...cardS, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)' }}>{pkg.clientName}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: status.bg, color: status.color }}>{status.label}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>{pkg.unit}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {services.map((service, index) => (
              <span key={`${service.name}-${index}`} style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.06)', color: '#6366f1' }}>
                {service.name} × {service.quantity}
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
          {pkg.paymentProvider && (
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
              {[pkg.paymentProvider, pkg.paymentBrand].filter(Boolean).join(' · ')}
            </div>
          )}
          {pkg.paymentFeeAmount > 0 && (
            <div style={{ fontSize: '0.68rem', color: pkg.paymentFeePayer === 'client' ? '#f59e0b' : '#ef4444' }}>
              Taxa {fmt(pkg.paymentFeeAmount)} • líquido {fmt(pkg.netValue ?? pkg.totalValue)}
            </div>
          )}
          {pkg.paymentFeePayer === 'client' && (pkg.chargedValue ?? pkg.totalValue) > pkg.totalValue && (
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f59e0b' }}>
              Cobrado: {fmt(pkg.chargedValue ?? pkg.totalValue)}
            </div>
          )}
          {pkg.paidValue > 0 && <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>Pago: {fmt(pkg.paidValue)}</div>}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {pkg.status === 'ativo' && (
              <button onClick={() => onMarkSession(pkg)} title="Registrar sessão" style={{
                padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.1)',
                color: '#10b981', cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_task</span> Sessão
              </button>
            )}
            <button onClick={() => onEdit(pkg)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>edit</span>
            </button>
            <button onClick={() => onDelete(pkg.id)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function PacotesPage() {
  const { units: UNITS, globalUnit } = useGlobalUnit();
  const [packages, setPackages] = useState<Package[]>([]);
  const [stats, setStats] = useState({ total: 0, ativos: 0, concluidos: 0, totalValue: 0, totalPaid: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
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
  const [paymentFeeConfigId, setPaymentFeeConfigId] = useState<string | null>(null);
  const [unit, setUnit] = useState('SCS');
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);

  // Autocomplete data
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const packageRequestRef = useRef<AbortController | null>(null);
  const requestKey = `${globalUnit || ''}:${statusFilter}`;
  const loading = loadedRequestKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog', { signal: controller.signal }).then(r => r.json()).then(d => setCatalogServices(d.services || [])).catch(() => {});
    fetch('/api/profissionais', { signal: controller.signal }).then(r => r.json()).then(d => setProfissionais(d || [])).catch(() => {});
    return () => controller.abort();
  }, []);

  const fetchPackages = useCallback(async () => {
    packageRequestRef.current?.abort();
    const controller = new AbortController();
    packageRequestRef.current = controller;
    const currentRequestKey = `${globalUnit || ''}:${statusFilter}`;
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (globalUnit) params.set('unit', globalUnit);
    try {
      const res = await fetch(`/api/packages?${params}`, { signal: controller.signal });
      const data = await res.json();
      if (controller.signal.aborted) return;
      setPackages(data.packages || []);
      setStats(data.stats || {});
      setLoadedRequestKey(currentRequestKey);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
  }, [statusFilter, globalUnit]);

  useEffect(() => {
    // State changes happen only after the async response; the rule cannot infer that boundary here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPackages();
    return () => packageRequestRef.current?.abort();
  }, [fetchPackages]);

  const totalValue = serviceLines.reduce((s, l) => {
    const lineTotal = l.quantity * l.unitPrice - l.discount * l.quantity;
    return s + Math.max(0, lineTotal);
  }, 0);
  const totalSessions = serviceLines.reduce((s, l) => s + l.quantity, 0);

  const resetForm = () => {
    setClientName(''); setClientId(''); setSelectedPatient(null); setVendedor(''); setCategoria('Receitas de serviços');
    setDataVenda(new Date().toISOString().split('T')[0]); setDescricao(''); setDataValidade('');
    setServiceLines([{ name: '', quantity: 1, unitPrice: 0, discount: 0, profissional: '' }]);
    const defaultUnit = globalUnit && UNITS.includes(globalUnit) ? globalUnit : 'SCS';
    setPaymentMethod('pix'); setInstallments('1'); setPaymentFeeConfigId(null); setUnit(defaultUnit); setNotes('');
    setEditingPkg(null); setShowAdvanced(false);
  };

  const openNew = () => { resetForm(); setShowModal(true); };
  const openEdit = useCallback((pkg: Package) => {
    setEditingPkg(pkg);
    setClientName(pkg.clientName);
    setClientId(pkg.clientId || '');
    const storedServices = parseServiceLines(pkg.services);
    setServiceLines(storedServices.length > 0 ? storedServices : [{ name: '', quantity: 1, unitPrice: 0, discount: 0, profissional: '' }]);
    setPaymentMethod(pkg.paymentMethod);
    setInstallments(String(pkg.installments));
    setPaymentFeeConfigId(null);
    setUnit(pkg.unit);
    setNotes(pkg.notes || '');
    setShowModal(true);
  }, []);

  const handleSave = async () => {
    if (!clientName.trim()) { toast('Nome do cliente obrigatório', 'error'); return; }
    const validLines = serviceLines.filter(l => l.name.trim());
    if (validLines.length === 0) { toast('Adicione pelo menos um serviço', 'error'); return; }

    const body = {
      ...(editingPkg && { id: editingPkg.id }),
      clientName, clientId: clientId || null,
      services: validLines, totalValue, totalSessions,
      paymentMethod, installments: parseInt(installments),
      ...(editingPkg ? {} : { paymentFeeConfigId }),
      unit, notes: notes || null,
      ...(editingPkg ? {} : { paidValue: 0, completedSessions: 0 }),
    };

    const method = editingPkg ? 'PUT' : 'POST';
    const res = await fetch('/api/packages', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast(editingPkg ? 'Pacote atualizado!' : 'Pacote criado!', 'success');
      setShowModal(false); resetForm(); fetchPackages();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || 'Não foi possível salvar a venda.', 'error');
    }
  };

  const handleDelete = useCallback(async (id: string) => {
    if (!await confirmDialog({ title: 'Excluir Pacote', message: 'Tem certeza que deseja excluir este pacote? Esta ação não pode ser desfeita.', confirmText: 'Sim, excluir', variant: 'danger' })) return;
    await fetch(`/api/packages?id=${id}`, { method: 'DELETE' });
    toast('Pacote removido', 'success'); fetchPackages();
  }, [fetchPackages]);

  const markSession = useCallback(async (pkg: Package) => {
    const newCompleted = Math.min(pkg.completedSessions + 1, pkg.totalSessions);
    const newStatus = newCompleted >= pkg.totalSessions ? 'concluido' : 'ativo';
    await fetch('/api/packages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pkg.id, completedSessions: newCompleted, status: newStatus }) });
    toast(`Sessão ${newCompleted}/${pkg.totalSessions} registrada!`, 'success'); fetchPackages();
  }, [fetchPackages]);

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
      const numericValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
      if (field === 'quantity') lines[i].quantity = numericValue;
      if (field === 'unitPrice') lines[i].unitPrice = numericValue;
      if (field === 'discount') lines[i].discount = numericValue;
    }
    setServiceLines(lines);
  };

  const handlePatientSelect = (patient: PatientData) => {
    setClientName(patient.name);
    setClientId(patient.id);
    setSelectedPatient(patient);
    if (!descricao) setDescricao(`Pacote para ${patient.name}`);
  };
  const handlePatientClear = () => {
    setClientName('');
    setClientId('');
    setSelectedPatient(null);
  };

  return (
    <AuthGuard>
      <AppHeader activePage="pacotes" />
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <AdminPageHeader
          title="Pacotes Fechados"
          description="Gerencie pacotes de serviços vendidos"
          icon="inventory_2"
          action={(
            <AdminPrimaryAction data-tour="vendas-novo-pacote" onClick={openNew} icon="add">
              Novo Pacote
            </AdminPrimaryAction>
          )}
        />

        {/* KPIs */}
        <AdminKpiGrid
          tourId="vendas-kpis"
          variant="spacious"
          minWidth={180}
          items={[
            { icon: 'inventory_2', color: '#6366f1', label: 'Total Pacotes', value: String(stats.total) },
            { icon: 'check_circle', color: '#10b981', label: 'Ativos', value: String(stats.ativos) },
            { icon: 'verified', color: '#8b5cf6', label: 'Concluídos', value: String(stats.concluidos) },
            { icon: 'payments', color: '#f59e0b', label: 'Valor Total', value: fmt(stats.totalValue) },
            { icon: 'account_balance', color: '#10b981', label: 'Recebido', value: fmt(stats.totalPaid) },
          ]}
        />

        {/* Filters */}
        <div data-tour="vendas-filtros" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['', 'ativo', 'concluido', 'cancelado'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '8px 16px', borderRadius: 10, border: statusFilter === s ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: statusFilter === s ? 'var(--primary)' : 'var(--card-bg)', color: statusFilter === s ? '#fff' : 'var(--text-main)',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
            }}>{s ? (STATUS_MAP[s]?.label || s) : 'Todos'}</button>
          ))}
        </div>

        {/* Package List */}
        <div data-tour="vendas-lista" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ ...cardS, textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div>
          ) : packages.length === 0 ? (
            <div style={{ ...cardS, textAlign: 'center', padding: '40px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3 }}>inventory_2</span>
              <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>Nenhum pacote encontrado</p>
            </div>
          ) : packages.map(pkg => (
            <PackageCard key={pkg.id} pkg={pkg} onEdit={openEdit} onDelete={handleDelete} onMarkSession={markSession} />
          ))}
        </div>
      </main>

      {/* ═══════════ CREATE/EDIT MODAL ═══════════ */}
      {showModal && (
        <div className="package-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }} onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="package-modal" onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 0, maxWidth: 780, width: '100%', maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 10, borderRadius: '24px 24px 0 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>inventory_2</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{editingPkg ? 'Editar Pacote' : 'Nova venda de pacote'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            <div className="package-modal-body" style={{ padding: '20px 28px' }}>
              {/* ──── SECTION 1: Client & Sale Info ──── */}
              <div style={sectionS}>
                <div className="package-client-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {/* Cliente — Autocomplete Inteligente */}
                  <div>
                    <PatientAutocomplete
                      value={selectedPatient}
                      onSelect={handlePatientSelect}
                      onClear={handlePatientClear}
                      onNameChange={name => setClientName(name)}
                      label="Cliente"
                      required
                      placeholder="Digite o nome do paciente..."
                      unit={globalUnit || undefined}
                      units={UNITS}
                    />
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

                <div className="package-sale-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
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
                    <DatePicker value={dataVenda} onChange={setDataVenda} variant="input" />
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
                  <div className="package-advanced-grid" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    {editingPkg && <div>
                      <label style={labelS}>Pagamento</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} disabled={Boolean(editingPkg.paymentFeeConfigId || editingPkg.paymentProvider || editingPkg.paymentFeeAmount > 0)} style={{ ...inputS, cursor: 'pointer' }}>
                        {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>}
                    {editingPkg && <div>
                      <label style={labelS}>Parcelas</label>
                      <select value={installments} onChange={e => setInstallments(e.target.value)} disabled={Boolean(editingPkg.paymentFeeConfigId || editingPkg.paymentProvider || editingPkg.paymentFeeAmount > 0)} style={{ ...inputS, cursor: 'pointer' }}>
                        {Array.from({ length: 18 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                      </select>
                    </div>}
                    <div>
                      <label style={labelS}>Unidade</label>
                      <select value={unit} onChange={e => setUnit(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelS}>Data validade</label>
                      <DatePicker value={dataValidade} onChange={setDataValidade} variant="input" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelS}>Observações</label>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputS, height: 'auto', resize: 'vertical' }} placeholder="Notas importantes sobre o pacote ou cliente" />
                    </div>
                    {editingPkg && (editingPkg.paymentFeeConfigId || editingPkg.paymentProvider || editingPkg.paymentFeeAmount > 0) && (
                      <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        Método e parcelas ficam bloqueados nesta edição para preservar a taxa registrada na venda. Alterações no valor reutilizam a mesma taxa histórica.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ──── SECTION 2: Procedimentos/Produtos ──── */}
              <div style={sectionS}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 900 }}>Procedimentos/Produtos</h3>

                {/* Column headers */}
                <div className="package-service-header" style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 60px 100px 100px 100px 36px', gap: 8, marginBottom: 6, padding: '0 2px' }}>
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
                      <div key={i} className="package-service-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 60px 100px 100px 100px 36px', gap: 8, alignItems: 'end' }}>
                        <div className="package-service-field package-service-name">
                          <span className="package-service-mobile-label">Nome</span>
                          <ProcedureSelector
                            value={line.name}
                            onChange={(name, price) => {
                              updateLine(i, 'name', name);
                              if (price !== undefined) updateLine(i, 'unitPrice', price);
                            }}
                            services={catalogServices}
                            placeholder="Buscar procedimento..."
                          />
                        </div>
                        <div className="package-service-field package-service-professional">
                          <span className="package-service-mobile-label">Profissional</span>
                          <select value={line.profissional} onChange={e => updateLine(i, 'profissional', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', cursor: 'pointer' }}>
                            <option value="">Pesquise/Selecione</option>
                            {profissionais.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            {UNITS.map(u => <option key={`u-${u}`} value={`Virtuosa ${u}`}>Virtuosa {u}</option>)}
                          </select>
                        </div>
                        <label className="package-service-field">
                          <span className="package-service-mobile-label">Qtd.</span>
                          <input type="number" min={1} value={line.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} style={{ ...inputS, height: 42, textAlign: 'center', fontSize: '0.82rem', padding: '0 4px' }} />
                        </label>
                        <label className="package-service-field">
                          <span className="package-service-mobile-label">Valor (R$)</span>
                          <input type="number" step="0.01" value={line.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                        </label>
                        <label className="package-service-field">
                          <span className="package-service-mobile-label">Desconto un.</span>
                          <input type="number" step="0.01" value={line.discount} onChange={e => updateLine(i, 'discount', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                        </label>
                        <div className="package-service-field">
                          <span className="package-service-mobile-label">Total (R$)</span>
                          <div className="package-service-total" style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            {lineTotal.toFixed(2)}
                          </div>
                        </div>
                        <div className="package-service-delete">
                          <button onClick={() => removeLine(i)} aria-label={`Excluir item ${i + 1}`} style={{ width: 36, height: 42, borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>



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

                {editingPkg && parseInt(installments) > 1 && totalValue > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>info</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6366f1' }}>
                      {installments}x de {fmt(totalValue / parseInt(installments))}
                    </span>
                  </div>
                )}
              </div>

              {!editingPkg && (
                <PaymentFeeSection
                  unit={unit}
                  baseAmount={totalValue}
                  paymentMethod={paymentMethod}
                  installments={Number(installments)}
                  selectedConfigId={paymentFeeConfigId}
                  onPaymentMethodChange={setPaymentMethod}
                  onInstallmentsChange={value => setInstallments(String(value))}
                  onConfigChange={setPaymentFeeConfigId}
                />
              )}

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
      <style jsx>{`
        .package-service-field { min-width: 0; }
        .package-service-mobile-label { display: none; }
        @media (max-width: 760px) {
          .package-modal-overlay { padding: 8px !important; align-items: center !important; }
          .package-modal { width: 100% !important; max-height: calc(100dvh - 16px) !important; border-radius: 18px !important; }
          .package-modal-body { padding: 16px !important; }
          .package-client-grid, .package-sale-grid, .package-advanced-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .package-service-header { display: none !important; }
          .package-service-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; gap: 10px !important; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
          .package-service-name, .package-service-professional, .package-service-delete { grid-column: 1 / -1; }
          .package-service-mobile-label { display: block; margin: 0 0 5px 2px; color: var(--text-muted); font-size: .64rem; font-weight: 800; text-transform: uppercase; }
          .package-service-total { border: 1px solid var(--border); border-radius: 10px; background: var(--card-bg); }
          .package-service-delete > button { width: 100% !important; }
        }
        @media (max-width: 430px) {
          .package-modal-body { padding: 12px !important; }
        }
      `}</style>
    </AuthGuard>
  );
}
