'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import { useGlobalUnit } from '@/contexts/UnitContext';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { ProcedureSelector } from '@/components/procedure-selector';
import { DatePicker } from '@/components/ui/date-picker';

interface OrcLine { name: string; quantity: number; unitPrice: string; discount: string; }
interface CatalogService { id: string; name: string; price: number; duration: number; category: string; }

interface ClientForm {
  name: string; email: string; phone: string; birthdate: string;
  cpf: string; rg: string; gender: string; profissao: string;
  estadoCivil: string; source: string; notes: string; tags: string;
  unit: string; isActive: boolean;
  cep: string; pais: string; estado: string; cidade: string;
  bairro: string; rua: string; numero: string; complemento: string;
  closingDate: string;
}

interface Client extends ClientForm { id: string; createdAt: string; }

const EMPTY_FORM: ClientForm = {
  name: '', email: '', phone: '', birthdate: '', cpf: '', rg: '',
  gender: '', profissao: '', estadoCivil: '', source: '', notes: '', tags: '',
  unit: 'Barueri', isActive: true,
  cep: '', pais: 'Brasil', estado: '', cidade: '', bairro: '', rua: '', numero: '', complemento: '',
  closingDate: '',
};

const REQUIRED_FIELDS: { key: keyof ClientForm; label: string }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefone' },
  { key: 'birthdate', label: 'Data de nascimento' },
  { key: 'cpf', label: 'CPF' },
  { key: 'rg', label: 'RG' },
  { key: 'gender', label: 'Sexo' },
  { key: 'profissao', label: 'Profissão' },
  { key: 'estadoCivil', label: 'Estado Civil' },
  { key: 'source', label: 'Origem' },
  { key: 'cep', label: 'CEP' },
  { key: 'estado', label: 'Estado' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'rua', label: 'Rua' },
  { key: 'numero', label: 'Número' },
];

const SOURCES = ['Instagram', 'Indicação', 'Google', 'WhatsApp', 'Site', 'Facebook', 'TikTok', 'Panfleto', 'Outro'];
const ESTADOS_CIVIS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União Estável' },
];

const TAG_OPTIONS = ['VIP', 'Pacote', 'Recorrente', 'Primeira vez', 'Indicação'];
const ESTADOS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.88rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 46 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const };
const sectionS: React.CSSProperties = { background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '24px 28px', marginBottom: 20 };
const errorBorderS: React.CSSProperties = { borderColor: '#ef4444' };
const errorTextS: React.CSSProperties = { fontSize: '0.68rem', color: '#ef4444', fontWeight: 600, marginTop: 4 };

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};
const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};
const formatCEP = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
};

export default function CadastroClientePage() {
  const { units: UNITS, globalUnit } = useGlobalUnit();
  const [form, setForm] = useState<ClientForm>({ ...EMPTY_FORM, unit: globalUnit || 'Barueri' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAddressSection, setShowAddressSection] = useState(true);
  const [cepLoading, setCepLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  // Sync form unit when globalUnit changes (e.g. user switches unit in header)
  useEffect(() => {
    if (globalUnit && !editingId) {
      setForm(prev => ({ ...prev, unit: globalUnit }));
    }
  }, [globalUnit, editingId]);

  // ── Name autocomplete state ──
  const [nameSuggestions, setNameSuggestions] = useState<Client[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [nameSearching, setNameSearching] = useState(false);
  const nameDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const nameContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem('virtuosa_user');
    if (raw) {
      const u = JSON.parse(raw);
      const admin = u.role === 'ADMIN' || (u.permissions && u.permissions.admin);
      setIsAdmin(admin);
      setCanDelete(admin || (u.permissions && u.permissions.deleteOrcamento));
    }
  }, []);

  // Auto-sync form.unit with the header's globalUnit
  useEffect(() => {
    if (globalUnit) {
      setForm(prev => ({ ...prev, unit: globalUnit }));
    }
  }, [globalUnit]);

  // Procedures of interest
  const [orcLines, setOrcLines] = useState<OrcLine[]>([{ name: '', quantity: 1, unitPrice: '', discount: '' }]);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [installments, setInstallments] = useState(1);

  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(d => setCatalogServices(d.services || [])).catch(() => {});
  }, []);

  const parseNum = (v: string) => { const clean = v.replace(/[^\d.,]/g, ''); const hasBrFormat = clean.includes(','); const normalized = hasBrFormat ? clean.replace(/\./g, '').replace(',', '.') : clean; const n = parseFloat(normalized); return isNaN(n) ? 0 : n; };
  const fmtCurrency = (v: string) => {
    const n = parseNum(v);
    if (v === '' || v === undefined) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const orcTotal = orcLines.reduce((s, l) => {
    const subtotal = l.quantity * parseNum(l.unitPrice);
    return s + Math.max(0, subtotal - parseNum(l.discount));
  }, 0);
  const addOrcLine = () => setOrcLines([...orcLines, { name: '', quantity: 1, unitPrice: '', discount: '' }]);
  const removeOrcLine = (i: number) => setOrcLines(orcLines.filter((_, idx) => idx !== i));
  const updateOrcLine = (i: number, field: keyof OrcLine, value: string | number) => {
    const lines = [...orcLines];
    if (field === 'name') {
      lines[i].name = value as string;
      const svc = catalogServices.find(s => s.name === value);
      if (svc) lines[i].unitPrice = svc.price.toString();
    } else if (field === 'quantity') {
      lines[i].quantity = typeof value === 'string' ? (parseInt(value) || 0) : value;
    } else {
      (lines[i] as any)[field] = String(value);
    }
    setOrcLines(lines);
  };

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '1000' });
      if (globalUnit) params.set('unit', globalUnit);
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch {}
    setLoading(false);
  }, [globalUnit]);

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

  const handleNameAutocomplete = (text: string) => {
    set('name', text);
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      searchByName(text);
      if (text.trim().length >= 2) setShowNameSuggestions(true);
      else setShowNameSuggestions(false);
    }, 300);
  };

  const selectNameSuggestion = (c: Client) => {
    setForm({
      name: c.name,
      email: (c as any).email || '',
      phone: (c as any).phone || '',
      cpf: (c as any).cpf || '',
      rg: (c as any).rg || '',
      birthdate: (c as any).birthdate || '',
      gender: (c as any).gender || '',
      profissao: (c as any).profissao || '',
      estadoCivil: (c as any).estadoCivil || '',
      source: (c as any).source || '',
      notes: (c as any).notes || '',
      tags: (c as any).tags || '',
      unit: (c as any).unit || UNITS[0] || 'Barueri',
      isActive: (c as any).isActive !== false,
      cep: (c as any).cep || '',
      pais: (c as any).pais || 'Brasil',
      estado: (c as any).estado || '',
      cidade: (c as any).cidade || '',
      bairro: (c as any).bairro || '',
      rua: (c as any).rua || '',
      numero: (c as any).numero || '',
      complemento: (c as any).complemento || '',
      closingDate: (c as any).closingDate || '',
    });
    setEditingId(c.id);
    setShowNameSuggestions(false);
    setErrors({});
    toast('Dados do cliente preenchidos automaticamente!', 'success');
  };

  const getInitials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const getColor = (name: string) => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#e600a0', '#ef4444', '#8b5cf6', '#14b8a6'];
    let hash = 0; for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const set = (key: keyof ClientForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setTouched(prev => ({ ...prev, [key]: true }));
    // Clear error when user types
    if (errors[key]) setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // Auto-buscar CEP when 8 digits are typed
  useEffect(() => {
    const cepClean = form.cep.replace(/\D/g, '');
    if (cepClean.length !== 8) return;

    const timer = setTimeout(async () => {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm(prev => ({
            ...prev,
            rua: data.logradouro || prev.rua,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            estado: data.uf || prev.estado,
          }));
          setErrors(prev => {
            const n = { ...prev };
            ['rua', 'bairro', 'cidade', 'estado', 'cep'].forEach(k => delete n[k]);
            return n;
          });
          toast('✅ Endereço preenchido automaticamente!', 'success');
        } else {
          toast('CEP não encontrado', 'error');
        }
      } catch { toast('Erro ao buscar CEP', 'error'); }
      setCepLoading(false);
    }, 400); // Small debounce

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cep]);

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    REQUIRED_FIELDS.forEach(f => {
      if (!form[f.key] || (typeof form[f.key] === 'string' && !(form[f.key] as string).trim())) {
        errs[f.key] = `${f.label} é obrigatório`;
      }
    });
    // Email validation
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'E-mail inválido';
    }
    // CPF validation (basic length)
    if (form.cpf && form.cpf.replace(/\D/g, '').length !== 11) {
      errs.cpf = 'CPF deve ter 11 dígitos';
    }
    return errs;
  };

  const handleSave = async (forceOverride = false) => {
    // Mark all as touched
    const allTouched: Record<string, boolean> = {};
    REQUIRED_FIELDS.forEach(f => { allTouched[f.key] = true; });
    setTouched(allTouched);

    const errs = validate();
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      toast(`${Object.keys(errs).length} campo(s) obrigatório(s) faltando`, 'error');
      // Scroll to first error
      const firstErrorKey = Object.keys(errs)[0];
      const el = document.getElementById(`field-${firstErrorKey}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSaving(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const quoteTotal = orcLines.reduce((s, l) => {
        const subtotal = l.quantity * parseNum(l.unitPrice);
        return s + Math.max(0, subtotal - parseNum(l.discount));
      }, 0);
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        ...form,
        unit: editingId ? form.unit : (globalUnit || form.unit), // Always use current globalUnit for new clients
        quoteValue: quoteTotal,
        quoteData: JSON.stringify(orcLines.filter(l => l.name.trim())),
        paymentMethod: paymentMethod || null,
        installments: (paymentMethod === 'credito' || paymentMethod === 'link') ? installments : 1,
        closingDate: form.closingDate || null,
        ...(editingId ? {} : { stage: 'orcamento' }),
        ...(forceOverride ? { force: true } : {}),
      };
      const res = await fetch('/api/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      
      if (res.ok) {
        toast(editingId ? 'Cliente atualizado!' : 'Orçamento cadastrado!', 'success');
        setForm({ ...EMPTY_FORM, unit: globalUnit || 'Barueri' }); setEditingId(null); setShowForm(false); setErrors({}); setTouched({});
        setOrcLines([{ name: '', quantity: 1, unitPrice: '', discount: '' }]);
        setPaymentMethod(''); setInstallments(1);
        fetchClients();
      } else if (res.status === 409) {
        // Duplicate detected — ask user to confirm
        const data = await res.json();
        const candidateNames = (data.candidates || []).map((c: any) => c.name).join(', ');
        const shouldForce = confirm(
          `⚠️ Cliente com dados semelhantes já existe:\n\n${candidateNames}\n\nDeseja cadastrar mesmo assim?`
        );
        if (shouldForce) {
          setSaving(false);
          return handleSave(true); // Retry with force=true
        } else {
          toast('Cadastro cancelado — cliente já existe.', 'warning');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || 'Erro ao salvar', 'error');
      }
    } catch { toast('Erro de conexão', 'error'); }
    setSaving(false);
  };

  const handleEdit = (client: Client) => {
    setForm({
      name: client.name || '', email: (client as any).email || '', phone: (client as any).phone || '',
      birthdate: (client as any).birthdate || '', cpf: (client as any).cpf || '', rg: (client as any).rg || '',
      gender: (client as any).gender || '', profissao: (client as any).profissao || '',
      estadoCivil: (client as any).estadoCivil || '', source: (client as any).source || '',
      notes: (client as any).notes || '', tags: (client as any).tags || '',
      unit: (client as any).unit || 'Barueri', isActive: (client as any).isActive !== false,
      cep: (client as any).cep || '', pais: (client as any).pais || 'Brasil',
      estado: (client as any).estado || '', cidade: (client as any).cidade || '',
      bairro: (client as any).bairro || '', rua: (client as any).rua || '',
      numero: (client as any).numero || '', complemento: (client as any).complemento || '',
      closingDate: (client as any).closingDate || '',
    });
    setEditingId(client.id);
    // Restore saved procedures
    try {
      const saved = (client as any).quoteData ? JSON.parse((client as any).quoteData) : [];
      if (saved.length > 0) {
        setOrcLines(saved.map((l: any) => ({
          name: l.name || '', quantity: l.quantity || 1,
          unitPrice: String(l.unitPrice || ''), discount: String(l.discount || ''),
        })));
      } else {
        setOrcLines([{ name: '', quantity: 1, unitPrice: '', discount: '' }]);
      }
    } catch { setOrcLines([{ name: '', quantity: 1, unitPrice: '', discount: '' }]); }
    // Restore payment info
    setPaymentMethod((client as any).paymentMethod || '');
    setInstallments((client as any).installments || 1);
    setShowForm(true);
    setErrors({});
    setTouched({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConvertToVenda = async (clientId: string) => {
    try {
      // Find the client
      const client = clients.find(c => c.id === clientId);
      if (!client) { toast('Cliente não encontrado', 'error'); return; }

      // Update client stage to 'venda'
      const res = await fetch('/api/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: clientId, stage: 'venda' }) });
      if (!res.ok) { toast('Erro ao converter', 'error'); return; }

      // Create a Package from the quote data
      const quoteValue = (client as any).quoteValue || 0;
      let services: any[] = [];
      try { services = JSON.parse((client as any).quoteData || '[]'); } catch {}
      const totalSessions = services.reduce((s: number, l: any) => s + (l.quantity || 1), 0);

      await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: client.name,
          clientId: clientId,
          services: JSON.stringify(services),
          totalValue: quoteValue,
          paidValue: 0,
          paymentMethod: (client as any).paymentMethod || 'pix',
          installments: (client as any).installments || 1,
          totalSessions,
          completedSessions: 0,
          status: 'ativo',
          unit: (client as any).unit || 'Barueri',
        }),
      });

      toast('Convertido em Venda com sucesso!', 'success');
      fetchClients();
    } catch { toast('Erro de conexão', 'error'); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch('/api/clients', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (res.ok) {
        toast('Orçamento excluído com sucesso!', 'success');
        setDeleteConfirmId(null);
        fetchClients();
      } else {
        toast('Erro ao excluir', 'error');
      }
    } catch { toast('Erro de conexão', 'error'); }
  };



  const missingCount = Object.keys(validate()).length;
  const filteredClients = searchTerm.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || ((c as any).cpf || '').includes(searchTerm))
    : clients;

  const renderField = (key: keyof ClientForm, label: string, required: boolean, inputEl: React.ReactNode) => (
    <div id={`field-${key}`}>
      <label style={{ ...labelS, color: touched[key] && errors[key] ? '#ef4444' : 'var(--text-muted)' }}>
        {label}{required && ' *'}
      </label>
      {inputEl}
      {touched[key] && errors[key] && <div style={errorTextS}>{errors[key]}</div>}
    </div>
  );

  return (
    <AuthGuard>
      <AppHeader activePage="pacotes-orcamento" />
      <main style={{ padding: '16px', maxWidth: 1000, margin: '0 auto' }}>
        {/* Header — mobile-first */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>person_add</span>
                Cadastro de Clientes
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Cadastre e gerencie as informações completas dos clientes</p>
            </div>
            {!showForm && (
              <button data-tour="orc-novo-cliente" onClick={() => { setForm({ ...EMPTY_FORM, unit: globalUnit || 'Barueri' }); setEditingId(null); setShowForm(true); setErrors({}); setTouched({}); }} style={{ padding: '11px 20px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', minHeight: 44 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span> Novo Cliente
              </button>
            )}
          </div>
        </div>

        {showForm ? (
          <>
            {/* Validation banner */}
            {Object.keys(errors).length > 0 && Object.keys(touched).length > 0 && (
              <div style={{ marginBottom: 16, padding: '14px 20px', borderRadius: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#ef4444', marginTop: 2 }}>warning</span>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#ef4444', marginBottom: 4 }}>
                    {Object.keys(errors).length} campo(s) obrigatório(s) faltando
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.entries(errors).map(([key, msg]) => (
                      <button key={key} onClick={() => { const el = document.getElementById(`field-${key}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                        style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {msg}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ SECTION 1: Dados Pessoais ═══ */}
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>badge</span>
                Dados Pessoais
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
                {/* ── Nome with autocomplete ── */}
                <div id="field-name" ref={nameContainerRef} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ ...labelS, marginBottom: 0, color: touched.name && errors.name ? '#ef4444' : 'var(--text-muted)' }}>Nome *</label>
                    {editingId && (
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.08)', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>check_circle</span>
                        Vinculado
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: editingId ? '#10b981' : 'var(--text-muted)', transition: 'color 0.2s', zIndex: 1 }}>
                      {editingId ? 'person_check' : 'person_search'}
                    </span>
                    <input
                      value={form.name}
                      onChange={e => handleNameAutocomplete(e.target.value)}
                      onFocus={() => { if (form.name.trim().length >= 2 && !editingId) { searchByName(form.name); setShowNameSuggestions(true); } }}
                      style={{
                        ...inputS,
                        paddingLeft: 38,
                        borderColor: editingId ? 'rgba(16,185,129,0.3)' : showNameSuggestions ? 'var(--primary)' : (touched.name && errors.name ? '#ef4444' : 'var(--border)'),
                        boxShadow: showNameSuggestions ? '0 0 0 3px rgba(230,0,126,0.08)' : 'none',
                        transition: 'all 0.2s',
                      }}
                      placeholder="Nome Sobrenome"
                      autoComplete="off"
                    />
                    {form.name && (
                      <button type="button" onClick={() => { set('name', ''); setEditingId(null); setShowNameSuggestions(false); setNameSuggestions([]); }}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', zIndex: 1 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                      </button>
                    )}
                  </div>
                  {touched.name && errors.name && <div style={errorTextS}>{errors.name}</div>}

                  {/* Dropdown suggestions */}
                  {showNameSuggestions && !editingId && (
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
                        const clr = getColor(c.name);
                        return (
                          <div key={c.id}
                            onMouseDown={e => { e.preventDefault(); selectNameSuggestion(c); }}
                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${clr}, ${clr}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 900, flexShrink: 0 }}>
                              {getInitials(c.name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(c as any).phone && <span>📱 {formatPhone((c as any).phone)}</span>}
                                {(c as any).cpf && <span>🪪 {(c as any).cpf}</span>}
                                {(c as any).email && <span>✉️ {(c as any).email}</span>}
                              </div>
                            </div>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{(c as any).unit}</span>
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
                {renderField('email', 'E-mail', true,
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={{ ...inputS, ...(touched.email && errors.email ? errorBorderS : {}) }} placeholder="email@exemplo.com" />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                {renderField('phone', 'Telefone', true,
                  <div style={{ display: 'flex', gap: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px 0 0 12px', borderRight: 'none', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', height: 46 }}>
                      🇧🇷 +55
                    </div>
                    <input value={form.phone} onChange={e => set('phone', formatPhone(e.target.value))} style={{ ...inputS, borderRadius: '0 12px 12px 0', ...(touched.phone && errors.phone ? errorBorderS : {}) }} placeholder="(99) 99999-9999" />
                  </div>
                )}
                {renderField('birthdate', 'Data de nascimento', true,
                  <DatePicker value={form.birthdate} onChange={v => set('birthdate', v)} variant="input" inputStyle={touched.birthdate && errors.birthdate ? { borderColor: '#ef4444' } : {}} />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                {renderField('cpf', 'CPF', true,
                  <input value={form.cpf} onChange={e => set('cpf', formatCPF(e.target.value))} style={{ ...inputS, ...(touched.cpf && errors.cpf ? errorBorderS : {}) }} placeholder="000.000.000-00" />
                )}
                {renderField('rg', 'RG', true,
                  <input value={form.rg} onChange={e => set('rg', e.target.value)} style={{ ...inputS, ...(touched.rg && errors.rg ? errorBorderS : {}) }} placeholder="Digite" />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                {renderField('gender', 'Sexo', true,
                  <div style={{ display: 'flex', gap: 0, height: 46 }}>
                    {[{ v: 'feminino', l: 'Feminino' }, { v: 'masculino', l: 'Masculino' }].map((opt, i) => (
                      <button key={opt.v} onClick={() => set('gender', opt.v)} style={{
                        flex: 1, border: '1px solid', borderColor: form.gender === opt.v ? 'var(--primary)' : (touched.gender && errors.gender ? '#ef4444' : 'var(--border)'),
                        background: form.gender === opt.v ? 'rgba(230,0,126,0.06)' : 'var(--bg)',
                        color: form.gender === opt.v ? 'var(--primary)' : 'var(--text-main)',
                        fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                        borderRadius: i === 0 ? '12px 0 0 12px' : '0 12px 12px 0',
                        borderLeft: i === 1 ? 'none' : undefined,
                      }}>{opt.l}</button>
                    ))}
                  </div>
                )}
                {renderField('tags', 'Etiquetas', false,
                  <select value={form.tags} onChange={e => set('tags', e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                    <option value="">Pesquise/Selecione</option>
                    {TAG_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </div>

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button onClick={() => set('isActive', !form.isActive)} style={{
                  width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: form.isActive ? '#10b981' : '#94a3b8', position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form.isActive ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>Ativo</span>
              </div>
            </div>

            {/* ═══ SECTION 2: Informações Adicionais ═══ */}
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>info</span>
                Informações adicionais
              </h3>

              <div style={{ marginBottom: 16 }}>
                {renderField('source', 'Origem', true,
                  <select value={form.source} onChange={e => set('source', e.target.value)} style={{ ...inputS, cursor: 'pointer', ...(touched.source && errors.source ? errorBorderS : {}) }}>
                    <option value="">Selecione a origem</option>
                    {SOURCES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                  </select>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                {renderField('profissao', 'Profissão', true,
                  <input value={form.profissao} onChange={e => set('profissao', e.target.value)} style={{ ...inputS, ...(touched.profissao && errors.profissao ? errorBorderS : {}) }} placeholder="Profissão" />
                )}
                {renderField('estadoCivil', 'Estado Civil', true,
                  <select value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)} style={{ ...inputS, cursor: 'pointer', ...(touched.estadoCivil && errors.estadoCivil ? errorBorderS : {}) }}>
                    <option value="">Selecione</option>
                    {ESTADOS_CIVIS.map(ec => <option key={ec.value} value={ec.value}>{ec.label}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label style={labelS}>Observações</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inputS, height: 'auto', minHeight: 46, resize: 'vertical' }} placeholder="Digite" />
              </div>
            </div>

            {/* ═══ SECTION 3: Endereço ═══ */}
            <div style={sectionS}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAddressSection ? 20 : 0 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>location_on</span>
                  Endereço
                </h3>
                <button onClick={() => setShowAddressSection(!showAddressSection)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, transition: 'transform 0.2s', transform: showAddressSection ? 'rotate(0deg)' : 'rotate(180deg)' }}>expand_less</span>
                </button>
              </div>

              {showAddressSection && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={labelS}>País</label>
                      <input value={form.pais} onChange={e => set('pais', e.target.value)} style={inputS} />
                    </div>
                    {renderField('cep', 'Código Postal', true,
                      <div style={{ position: 'relative' }}>
                        <input value={form.cep} onChange={e => set('cep', formatCEP(e.target.value))} style={{ ...inputS, ...(touched.cep && errors.cep ? errorBorderS : {}), paddingRight: cepLoading ? 44 : 16 }} placeholder="00000-000" />
                        {cepLoading && (
                          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
                          </div>
                        )}
                        {!cepLoading && form.cep.replace(/\D/g, '').length === 8 && form.rua && (
                          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#10b981' }}>check_circle</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                    {renderField('estado', 'Estado', true,
                      <select value={form.estado} onChange={e => set('estado', e.target.value)} style={{ ...inputS, cursor: 'pointer', ...(touched.estado && errors.estado ? errorBorderS : {}) }}>
                        <option value="">Selecione</option>
                        {ESTADOS_BR.map(e => <option key={e}>{e}</option>)}
                      </select>
                    )}
                    {renderField('cidade', 'Cidade', true,
                      <input value={form.cidade} onChange={e => set('cidade', e.target.value)} style={{ ...inputS, ...(touched.cidade && errors.cidade ? errorBorderS : {}) }} placeholder="Selecione" />
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                    {renderField('bairro', 'Bairro', true,
                      <input value={form.bairro} onChange={e => set('bairro', e.target.value)} style={{ ...inputS, ...(touched.bairro && errors.bairro ? errorBorderS : {}) }} placeholder="Digite" />
                    )}
                    {renderField('rua', 'Rua', true,
                      <input value={form.rua} onChange={e => set('rua', e.target.value)} style={{ ...inputS, ...(touched.rua && errors.rua ? errorBorderS : {}) }} placeholder="Digite" />
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    {renderField('numero', 'Número', true,
                      <input value={form.numero} onChange={e => set('numero', e.target.value)} style={{ ...inputS, ...(touched.numero && errors.numero ? errorBorderS : {}) }} placeholder="Digite" />
                    )}
                    <div>
                      <label style={labelS}>Complemento</label>
                      <input value={form.complemento} onChange={e => set('complemento', e.target.value)} style={inputS} placeholder="Digite" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ═══ SECTION 4: Procedimentos de Interesse ═══ */}
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>spa</span>
                Procedimentos de Interesse
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 'auto' }}>O que o cliente deseja contratar</span>
              </h3>

              {/* Procedure rows — card layout on mobile */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orcLines.map((line, i) => {
                  const subtotal = line.quantity * parseNum(line.unitPrice);
                  const lineTotal = Math.max(0, subtotal - parseNum(line.discount));
                  return (
                    <div key={i} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <label style={labelS}>Procedimento</label>
                          <ProcedureSelector
                            value={line.name}
                            onChange={(name, price) => {
                              updateOrcLine(i, 'name', name);
                              if (price !== undefined) updateOrcLine(i, 'unitPrice', String(price));
                            }}
                            services={catalogServices}
                            placeholder="Buscar procedimento..."
                          />
                        </div>
                        <button onClick={() => removeOrcLine(i)} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 18 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                        <div>
                          <label style={labelS}>Sessões</label>
                          <input type="number" min={1} value={line.quantity || ''} onChange={e => updateOrcLine(i, 'quantity', e.target.value)} style={{ ...inputS, height: 44, textAlign: 'center', fontSize: '0.9rem', padding: '0 8px' }} />
                        </div>
                        <div>
                          <label style={labelS}>Valor Unit. (R$)</label>
                          <input
                            value={line.unitPrice}
                            onChange={e => updateOrcLine(i, 'unitPrice', e.target.value)}
                            onBlur={() => { if (line.unitPrice !== '') updateOrcLine(i, 'unitPrice', fmtCurrency(line.unitPrice)); }}
                            onFocus={() => { const raw = parseNum(line.unitPrice); updateOrcLine(i, 'unitPrice', raw ? String(raw) : ''); }}
                            style={{ ...inputS, height: 44, fontSize: '0.9rem', padding: '0 10px' }}
                            placeholder="0,00"
                          />
                        </div>
                        <div>
                          <label style={labelS}>Desconto</label>
                          <input
                            value={line.discount}
                            onChange={e => updateOrcLine(i, 'discount', e.target.value)}
                            onBlur={() => { if (line.discount !== '') updateOrcLine(i, 'discount', fmtCurrency(line.discount)); }}
                            onFocus={() => { const raw = parseNum(line.discount); updateOrcLine(i, 'discount', raw ? String(raw) : ''); }}
                            style={{ ...inputS, height: 44, fontSize: '0.9rem', padding: '0 10px' }}
                            placeholder="0,00"
                          />
                        </div>
                        <div>
                          <label style={labelS}>Total</label>
                          <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 10px', fontWeight: 800, fontSize: '0.95rem', color: '#10b981', background: 'rgba(16,185,129,0.06)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.15)' }}>{fmt(lineTotal)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>



              <button onClick={addOrcLine} style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit', padding: '4px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Adicionar Procedimento
              </button>

              {orcTotal > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>Total do Orçamento: {fmt(orcTotal)}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{orcLines.filter(l => l.name.trim()).length} procedimento(s)</span>
                </div>
              )}
            </div>

            {/* ═══ SECTION 5: Pagamento ═══ */}
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>payments</span>
                Pagamento
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelS}>Forma de Pagamento *</label>
                  <select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); if (e.target.value !== 'credito' && e.target.value !== 'link') setInstallments(1); }}
                    style={{ ...inputS, cursor: 'pointer' }}>
                    <option value="">Selecione...</option>
                    <option value="pix">🟢 Pix</option>
                    <option value="dinheiro">💵 Dinheiro</option>
                    <option value="debito">💳 Cartão de Débito</option>
                    <option value="credito">💳 Cartão de Crédito</option>
                    <option value="link">🔗 Link de Pagamento</option>
                  </select>
                </div>

                {(paymentMethod === 'credito' || paymentMethod === 'link') && (
                  <div>
                    <label style={labelS}>Parcelas</label>
                    <select value={installments} onChange={e => setInstallments(parseInt(e.target.value))}
                      style={{ ...inputS, cursor: 'pointer' }}>
                      {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}x {orcTotal > 0 ? `de ${fmt(orcTotal / n)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={labelS}>Valor Total</label>
                  <div style={{ ...inputS, display: 'flex', alignItems: 'center', background: 'var(--bg)', fontWeight: 800, fontSize: '1rem', color: orcTotal > 0 ? '#10b981' : 'var(--text-muted)' }}>
                    {orcTotal > 0 ? fmt(orcTotal) : 'R$ 0,00'}
                  </div>
                </div>

                <div>
                  <label style={labelS}>Data de Fechamento</label>
                  <DatePicker value={form.closingDate} onChange={v => set('closingDate', v)} variant="input" />
                </div>
              </div>

              {paymentMethod && orcTotal > 0 && (
                <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>receipt_long</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#6366f1' }}>
                    {paymentMethod === 'pix' ? 'Pagamento via Pix' :
                     paymentMethod === 'dinheiro' ? 'Pagamento em Dinheiro' :
                     paymentMethod === 'debito' ? 'Pagamento no Débito' :
                     paymentMethod === 'credito' ? `Crédito em ${installments}x de ${fmt(orcTotal / installments)}` :
                     `Link de Pagamento em ${installments}x de ${fmt(orcTotal / installments)}`}
                    {' — '}{fmt(orcTotal)}
                  </span>
                </div>
              )}
            </div>

            {/* Completeness badge */}
            {missingCount > 0 && (
              <div style={{ marginBottom: 16, padding: '12px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>info</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>
                  Cadastro incompleto — {missingCount} campo(s) pendente(s)
                </span>
              </div>
            )}

            {/* Action Buttons — full-width on mobile */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 32 }}>
              <button onClick={() => handleSave()} disabled={saving}
                style={{ padding: '16px', borderRadius: 14, border: 'none', background: saving ? '#94a3b8' : 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.92rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{saving ? 'hourglass_top' : 'save'}</span>
                {saving ? 'Salvando...' : editingId ? 'Atualizar Cliente' : 'Cadastrar Cliente'}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM, unit: globalUnit || 'Barueri' }); setErrors({}); setTouched({}); }}
                style={{ padding: '14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', minHeight: 48 }}>
                Cancelar
              </button>
            </div>
          </>
        ) : (() => {
          // Use real status and value from DB
          const clientsWithQuote = filteredClients.map(client => {
            const stage = (client as any).stage || 'orcamento';
            const status: 'orcamento' | 'venda' = stage === 'venda' ? 'venda' : 'orcamento';
            const quoteValue = (client as any).quoteValue || 0;
            return { ...client, status, quoteValue };
          });

          const totalOrcamento = clientsWithQuote.filter(c => c.status === 'orcamento').reduce((s, c) => s + c.quoteValue, 0);
          const totalVenda = clientsWithQuote.filter(c => c.status === 'venda').reduce((s, c) => s + c.quoteValue, 0);
          const totalGeral = totalOrcamento + totalVenda;

          return (
          <>
            {/* Search */}
            <div data-tour="orc-busca" style={{ marginBottom: 20 }}>
              <div style={{ position: 'relative', maxWidth: 400 }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--text-muted)' }}>search</span>
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nome ou CPF..." style={{ ...inputS, paddingLeft: 44 }} />
              </div>
            </div>

            {/* KPIs with values */}
            <div data-tour="orc-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { icon: 'group', color: '#6366f1', label: 'Total Clientes', value: String(clients.length), isCurrency: false },
                { icon: 'request_quote', color: '#f59e0b', label: 'Orçamentos', value: String(clientsWithQuote.filter(c => c.status === 'orcamento').length), isCurrency: false },
                { icon: 'point_of_sale', color: '#10b981', label: 'Vendas', value: String(clientsWithQuote.filter(c => c.status === 'venda').length), isCurrency: false },
                { icon: 'payments', color: 'var(--primary)', label: 'Valor Total', value: fmt(totalGeral), isCurrency: true },
              ].map(kpi => (
                <div key={kpi.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${typeof kpi.color === 'string' && kpi.color.startsWith('#') ? kpi.color : '#e91e8c'}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
                    <div style={{ fontSize: kpi.isCurrency ? '1rem' : '1.2rem', fontWeight: 900 }}>{kpi.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Table header — hidden on mobile, shown as cards */}
            <div data-tour="orc-tabela" style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
              {/* Desktop table header — hidden on small screens */}
              <div style={{ display: 'grid', gridTemplateColumns: '50px minmax(0, 2fr) 110px 95px 95px 90px', gap: 0, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Nº', 'Nome', 'Valor', 'Data', 'Status', 'Ações'].map(h => (
                  <span key={h} style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>

              {/* Rows — card-based on mobile */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div>
              ) : clientsWithQuote.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: 0.2, color: 'var(--text-muted)' }}>person_add</span>
                  <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.92rem' }}>Nenhum cliente encontrado</p>
                </div>
              ) : clientsWithQuote.map((client, idx) => (
                <div key={client.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Mobile card layout */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.72rem', flexShrink: 0 }}>
                      {client.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>{client.name}</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: 'auto' }}>#{idx + 1}</span>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                          background: client.status === 'venda' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                          color: client.status === 'venda' ? '#10b981' : '#f59e0b',
                        }}>
                          {client.status === 'venda' ? 'Venda' : 'Orçamento'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {(client as any).phone || (client as any).email || '—'}
                        &nbsp;&middot;&nbsp;
                        {new Date(client.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    {/* Value */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 900, color: client.quoteValue > 0 ? '#10b981' : 'var(--text-muted)' }}>
                        {client.quoteValue > 0 ? fmt(client.quoteValue) : '—'}
                      </div>
                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
                        {client.status === 'orcamento' && (
                          <button onClick={() => handleConvertToVenda(client.id)} title="Converter em Venda"
                            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(16,185,129,0.15)', background: 'rgba(16,185,129,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#10b981' }}>check_circle</span>
                          </button>
                        )}
                        <button onClick={() => handleEdit(client)} title="Editar"
                          style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#3b82f6' }}>edit</span>
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteConfirmId(client.id)} title="Excluir"
                            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Footer totals — responsive */}
              {clientsWithQuote.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '14px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Valor Pendente: <strong style={{ color: '#f59e0b' }}>{fmt(totalOrcamento)}</strong>
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Valor Venda: <strong style={{ color: '#10b981' }}>{fmt(totalVenda)}</strong>
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Total: <strong style={{ color: 'var(--primary)' }}>{fmt(totalGeral)}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Results count */}
            <div style={{ marginTop: 12, padding: '10px 16px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Total de Resultados: {filteredClients.length}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteConfirmId(null)}>
                <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', padding: 32, maxWidth: 400, width: '90%', textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#ef4444', marginBottom: 12 }}>warning</span>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 900 }}>Excluir Orçamento?</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>Esta ação não pode ser desfeita. O cadastro do cliente será removido permanentemente.</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={() => setDeleteConfirmId(null)} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem' }}>Cancelar</button>
                    <button onClick={() => handleDelete(deleteConfirmId)} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span> Excluir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
          );
        })()}
      </main>
    </AuthGuard>
  );
}
