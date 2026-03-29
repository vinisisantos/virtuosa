'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface OrcLine { name: string; quantity: number; unitPrice: number; discount: number; }
interface CatalogService { id: string; name: string; price: number; duration: number; category: string; }

interface ClientForm {
  name: string; email: string; phone: string; birthdate: string;
  cpf: string; rg: string; gender: string; profissao: string;
  estadoCivil: string; source: string; notes: string; tags: string;
  unit: string; isActive: boolean;
  cep: string; pais: string; estado: string; cidade: string;
  bairro: string; rua: string; numero: string; complemento: string;
}

interface Client extends ClientForm { id: string; createdAt: string; }

const EMPTY_FORM: ClientForm = {
  name: '', email: '', phone: '', birthdate: '', cpf: '', rg: '',
  gender: '', profissao: '', estadoCivil: '', source: '', notes: '', tags: '',
  unit: 'Barueri', isActive: true,
  cep: '', pais: 'Brasil', estado: '', cidade: '', bairro: '', rua: '', numero: '', complemento: '',
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
const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
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
  const [form, setForm] = useState<ClientForm>({ ...EMPTY_FORM });
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

  // Procedures of interest
  const [orcLines, setOrcLines] = useState<OrcLine[]>([{ name: '', quantity: 1, unitPrice: 0, discount: 0 }]);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);

  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(d => setCatalogServices(d.services || [])).catch(() => {});
  }, []);

  const orcTotal = orcLines.reduce((s, l) => s + Math.max(0, l.quantity * l.unitPrice - l.discount * l.quantity), 0);
  const addOrcLine = () => setOrcLines([...orcLines, { name: '', quantity: 1, unitPrice: 0, discount: 0 }]);
  const removeOrcLine = (i: number) => setOrcLines(orcLines.filter((_, idx) => idx !== i));
  const updateOrcLine = (i: number, field: keyof OrcLine, value: string | number) => {
    const lines = [...orcLines];
    if (field === 'name') {
      lines[i].name = value as string;
      const svc = catalogServices.find(s => s.name === value);
      if (svc) lines[i].unitPrice = svc.price;
    } else {
      (lines[i] as any)[field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
    }
    setOrcLines(lines);
  };

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clients?limit=1000');
      const data = await res.json();
      setClients(data.clients || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

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

  const handleSave = async () => {
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
      const body = editingId ? { id: editingId, ...form } : form;
      const res = await fetch('/api/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast(editingId ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'success');
        setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(false); setErrors({}); setTouched({});
        fetchClients();
      } else {
        toast('Erro ao salvar', 'error');
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
    });
    setEditingId(client.id);
    setShowForm(true);
    setErrors({});
    setTouched({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <main style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>person_add</span>
              Cadastro de Clientes
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cadastre e gerencie as informações completas dos clientes</p>
          </div>
          {!showForm && (
            <button onClick={() => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(true); setErrors({}); setTouched({}); }} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span> Novo Cliente
            </button>
          )}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {renderField('name', 'Nome', true,
                  <input value={form.name} onChange={e => set('name', e.target.value)} style={{ ...inputS, ...(touched.name && errors.name ? errorBorderS : {}) }} placeholder="Nome Sobrenome" />
                )}
                {renderField('email', 'E-mail', true,
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={{ ...inputS, ...(touched.email && errors.email ? errorBorderS : {}) }} placeholder="email@exemplo.com" />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {renderField('phone', 'Telefone', true,
                  <div style={{ display: 'flex', gap: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px 0 0 12px', borderRight: 'none', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', height: 46 }}>
                      🇧🇷 +55
                    </div>
                    <input value={form.phone} onChange={e => set('phone', formatPhone(e.target.value))} style={{ ...inputS, borderRadius: '0 12px 12px 0', ...(touched.phone && errors.phone ? errorBorderS : {}) }} placeholder="(99) 99999-9999" />
                  </div>
                )}
                {renderField('birthdate', 'Data de nascimento', true,
                  <input type="date" value={form.birthdate} onChange={e => set('birthdate', e.target.value)} style={{ ...inputS, ...(touched.birthdate && errors.birthdate ? errorBorderS : {}) }} />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {renderField('cpf', 'CPF', true,
                  <input value={form.cpf} onChange={e => set('cpf', formatCPF(e.target.value))} style={{ ...inputS, ...(touched.cpf && errors.cpf ? errorBorderS : {}) }} placeholder="000.000.000-00" />
                )}
                {renderField('rg', 'RG', true,
                  <input value={form.rg} onChange={e => set('rg', e.target.value)} style={{ ...inputS, ...(touched.rg && errors.rg ? errorBorderS : {}) }} placeholder="Digite" />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {renderField('unit', 'Unidade', false,
                  <select value={form.unit} onChange={e => set('unit', e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                )}
                <div>
                  <label style={labelS}>Observações</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={1} style={{ ...inputS, height: 'auto', minHeight: 46, resize: 'vertical' }} placeholder="Digite" />
                </div>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    {renderField('bairro', 'Bairro', true,
                      <input value={form.bairro} onChange={e => set('bairro', e.target.value)} style={{ ...inputS, ...(touched.bairro && errors.bairro ? errorBorderS : {}) }} placeholder="Digite" />
                    )}
                    {renderField('rua', 'Rua', true,
                      <input value={form.rua} onChange={e => set('rua', e.target.value)} style={{ ...inputS, ...(touched.rua && errors.rua ? errorBorderS : {}) }} placeholder="Digite" />
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 100px 100px 100px 36px', gap: 8, marginBottom: 6, padding: '0 2px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Procedimento</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Qtd.</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Valor (R$)</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Desconto</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</span>
                <span />
              </div>

              {/* Procedure rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orcLines.map((line, i) => {
                  const lineTotal = Math.max(0, line.quantity * line.unitPrice - line.discount * line.quantity);
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 100px 100px 100px 36px', gap: 8, alignItems: 'center' }}>
                      <input value={line.name} onChange={e => updateOrcLine(i, 'name', e.target.value)} list="orc-svc-list" style={{ ...inputS, height: 42, fontSize: '0.82rem' }} placeholder="Pesquise/Selecione" />
                      <input type="number" min={1} value={line.quantity} onChange={e => updateOrcLine(i, 'quantity', e.target.value)} style={{ ...inputS, height: 42, textAlign: 'center', fontSize: '0.82rem', padding: '0 4px' }} />
                      <input type="number" step="0.01" value={line.unitPrice} onChange={e => updateOrcLine(i, 'unitPrice', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                      <input type="number" step="0.01" value={line.discount} onChange={e => updateOrcLine(i, 'discount', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                      <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 700, fontSize: '0.85rem' }}>{lineTotal.toFixed(2)}</div>
                      <button onClick={() => removeOrcLine(i)} style={{ width: 36, height: 42, borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <datalist id="orc-svc-list">
                {catalogServices.map(s => <option key={s.id} value={s.name} />)}
              </datalist>

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

            {/* Completeness badge */}
            {missingCount > 0 && (
              <div style={{ marginBottom: 16, padding: '12px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>info</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>
                  Cadastro incompleto — {missingCount} campo(s) pendente(s)
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingBottom: 32 }}>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM }); setErrors({}); setTouched({}); }}
                style={{ padding: '14px 32px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '14px 40px', borderRadius: 14, border: 'none', background: saving ? '#94a3b8' : 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{saving ? 'hourglass_top' : 'save'}</span>
                {saving ? 'Salvando...' : editingId ? 'Atualizar Cliente' : 'Cadastrar Cliente'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Search & Client List */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ position: 'relative', maxWidth: 400 }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--text-muted)' }}>search</span>
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nome ou CPF..." style={{ ...inputS, paddingLeft: 44 }} />
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { icon: 'group', color: '#6366f1', label: 'Total Clientes', value: clients.length },
                { icon: 'check_circle', color: '#10b981', label: 'Ativos', value: clients.filter(c => (c as any).isActive !== false).length },
                { icon: 'warning', color: '#f59e0b', label: 'Incompletos', value: clients.filter(c => !(c as any).cpf || !(c as any).email || !(c as any).rua).length },
              ].map(kpi => (
                <div key={kpi.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{kpi.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loading ? (
                <div style={{ ...cardS, textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div>
              ) : filteredClients.length === 0 ? (
                <div style={{ ...cardS, textAlign: 'center', padding: '60px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: 0.2, color: 'var(--text-muted)' }}>person_add</span>
                  <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.92rem' }}>Nenhum cliente encontrado</p>
                </div>
              ) : filteredClients.map(client => {
                const hasFullData = !!(client as any).cpf && !!(client as any).email && !!(client as any).rua;
                return (
                  <div key={client.id} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>
                      {client.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>{client.name}</span>
                        {!hasFullData && (
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>Incompleto</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {(client as any).phone && <span>📱 {(client as any).phone}</span>}
                        {(client as any).email && <span>✉️ {(client as any).email}</span>}
                        {(client as any).cpf && <span>🪪 {(client as any).cpf}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleEdit(client)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-main)', fontFamily: 'inherit' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span> Editar
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </AuthGuard>
  );
}
