'use client';
import { useState, useEffect, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  cpf: string | null; gender: string | null; birthdate: string | null;
  stage: string; quoteValue: number | null; quoteData: string | null;
  paymentMethod: string | null; installments: number | null;
  unit: string; createdAt: string;
  cep: string | null; estado: string | null; cidade: string | null; bairro: string | null; rua: string | null; numero: string | null;
  profissao: string | null; estadoCivil: string | null; rg: string | null;
}
interface Package {
  id: string; clientName: string; clientId: string | null; services: string;
  totalValue: number; paidValue: number; paymentMethod: string; installments: number;
  totalSessions: number; completedSessions: number; status: string; notes: string | null; createdAt: string;
}
interface Session {
  id: string; packageId: string; sessionNumber: number; date: string;
  professional: string | null; needsPhotos: boolean; needsMeasures: boolean;
  photos: string | null; measures: string | null; notes: string | null; status: string;
}
interface Measures { peso: string; bracoEsq: string; bracoDir: string; cintura: string; abdomen: string; quadril: string; coxaEsq: string; coxaDir: string; }

const EMPTY_MEASURES: Measures = { peso: '', bracoEsq: '', bracoDir: '', cintura: '', abdomen: '', quadril: '', coxaEsq: '', coxaDir: '' };
const MEASURE_LABELS: Record<keyof Measures, string> = { peso: 'Peso (kg)', bracoEsq: 'Braço Esq (cm)', bracoDir: 'Braço Dir (cm)', cintura: 'Cintura (cm)', abdomen: 'Abdômen (cm)', quadril: 'Quadril (cm)', coxaEsq: 'Coxa Esq (cm)', coxaDir: 'Coxa Dir (cm)' };
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.85rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 42 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' as const };

export default function FichaPacientePage() {
  const params = useParams();
  const clientId = params.id as string;
  const [client, setClient] = useState<Client | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [activePkg, setActivePkg] = useState<Package | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Session check-in state
  const [needsPhotos, setNeedsPhotos] = useState(false);
  const [needsMeasures, setNeedsMeasures] = useState(false);
  const [measures, setMeasures] = useState<Measures>({ ...EMPTY_MEASURES });
  const [sessionPhotos, setSessionPhotos] = useState<{ label: string; data: string }[]>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Tab
  const [tab, setTab] = useState<'info' | 'evolucao' | 'contrato'>('info');

  // Contract state: packageId -> { id, status, signingToken }
  const [contractMap, setContractMap] = useState<Record<string, { id: string; status: string; signingToken?: string }>>({}); 
  const [creatingContract, setCreatingContract] = useState<string | null>(null);
  const [allContracts, setAllContracts] = useState<any[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => { if (clientId) loadData(); }, [clientId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load client by ID
      const cRes = await fetch(`/api/clients?id=${clientId}`);
      const cData = await cRes.json();
      const found = (cData.clients || [])[0] || null;
      setClient(found);

      // Load packages for this client
      const pRes = await fetch(`/api/packages?search=${found?.name || ''}`);
      const pData = await pRes.json();
      const clientPkgs = (pData.packages || []).filter((p: Package) => p.clientId === clientId || p.clientName === found?.name);
      setPackages(clientPkgs);

      // Auto-select first active package
      const active = clientPkgs.find((p: Package) => p.status === 'ativo') || clientPkgs[0];
      if (active) {
        setActivePkg(active);
        loadSessions(active.id);
      }

      // Load contracts for this client
      if (found) loadContracts(found.name);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadSessions(packageId: string) {
    try {
      const res = await fetch(`/api/sessions?packageId=${packageId}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch { /* ignore */ }
  }

  async function loadContracts(clientName: string) {
    try {
      const res = await fetch(`/api/contracts?clientName=${encodeURIComponent(clientName)}`);
      const data = await res.json();
      const contracts = data.contracts || [];
      setAllContracts(contracts);
      
      // Map contracts to packages — flexible matching
      const map: Record<string, { id: string; status: string; signingToken?: string }> = {};
      const usedContractIds = new Set<string>();
      
      // Pass 1: Try to match by service names in content
      for (const pkg of packages.length > 0 ? packages : []) {
        let pkgServices: string[] = [];
        try { pkgServices = JSON.parse(pkg.services).map((s: any) => s.name.toLowerCase()); } catch {}
        const match = contracts.find((c: any) =>
          !usedContractIds.has(c.id) &&
          pkgServices.some((svc: string) => c.content?.toLowerCase().includes(svc))
        );
        if (match) {
          map[pkg.id] = { id: match.id, status: match.status, signingToken: match.signingToken || undefined };
          usedContractIds.add(match.id);
        }
      }
      
      // Pass 2: For unmatched packages, assign remaining contracts (by creation date proximity)
      const unmatchedPkgs = (packages.length > 0 ? packages : []).filter(p => !map[p.id]);
      const unmatchedContracts = contracts.filter((c: any) => !usedContractIds.has(c.id));
      for (let i = 0; i < unmatchedPkgs.length && i < unmatchedContracts.length; i++) {
        map[unmatchedPkgs[i].id] = {
          id: unmatchedContracts[i].id,
          status: unmatchedContracts[i].status,
          signingToken: unmatchedContracts[i].signingToken || undefined,
        };
      }
      
      setContractMap(map);
    } catch { /* ignore */ }
  }

  // Re-load contracts when packages change
  useEffect(() => {
    if (client && packages.length > 0) loadContracts(client.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, client]);

  async function handleContract(pkg: Package) {
    // If contract already exists, navigate to it
    const existing = contractMap[pkg.id];
    if (existing) {
      router.push(`/termos?contract=${existing.id}`);
      return;
    }

    // Redirect to termos generator with pre-filled client data
    setCreatingContract(pkg.id);
    try {
      let services: { name: string; quantity: number; unitPrice: number }[] = [];
      try { services = JSON.parse(pkg.services); } catch {}

      // Map payment method to display name
      const methodMap: Record<string, string> = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro', boleto: 'Boleto', link: 'Link de Pagamento' };
      const methodName = methodMap[pkg.paymentMethod] || pkg.paymentMethod || 'Pix';

      // Build payment installments
      const installmentValue = pkg.totalValue / (pkg.installments || 1);
      const paymentsArr = [];
      const today = new Date();
      for (let i = 0; i < (pkg.installments || 1); i++) {
        const dt = new Date(today);
        dt.setMonth(dt.getMonth() + i);
        paymentsArr.push({
          method: methodName,
          installments: 1,
          value: Math.round(installmentValue * 100) / 100,
          date: `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`,
        });
      }

      const params = new URLSearchParams({
        generate: '1',
        nome_completo: client?.name || pkg.clientName,
        cpf: client?.cpf || '',
        rg: client?.rg || '',
        telefone: client?.phone || '',
        email: client?.email || '',
        data_nascimento: client?.birthdate || '',
        sexo: client?.gender || '',
        estado_civil: client?.estadoCivil || '',
        profissao: client?.profissao || '',
        endereco_completo: [client?.rua, client?.numero, client?.bairro, client?.cidade, client?.estado, client?.cep].filter(Boolean).join(', '),
        unidade: client?.unit || 'Barueri',
        total_venda: String(pkg.totalValue),
        pagamento: `${methodName} - ${pkg.installments}x`,
        procs: JSON.stringify(services.map(s => ({
          name: s.name,
          sessions: s.quantity,
          subtotal: s.unitPrice * s.quantity,
          discount: 0,
          total: s.unitPrice * s.quantity,
        }))),
        payments: JSON.stringify(paymentsArr),
      });

      router.push(`/termos?${params.toString()}`);
    } catch {
      toast('Erro ao abrir gerador de contrato', 'error');
    }
    setCreatingContract(null);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setSessionPhotos(prev => [...prev, { label: file.name, data: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleFinalizeSession = async () => {
    if (!activePkg) return;
    if (needsPhotos && sessionPhotos.length === 0) {
      toast('Upload de fotos obrigatório para esta sessão conforme configurado.', 'error');
      return;
    }
    if (needsMeasures && Object.values(measures).every(v => !v.trim())) {
      toast('Medidas obrigatórias para esta sessão conforme configurado.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: activePkg.id,
          sessionNumber: (activePkg.completedSessions || 0) + 1,
          needsPhotos,
          needsMeasures,
          photos: sessionPhotos.length > 0 ? JSON.stringify(sessionPhotos) : null,
          measures: needsMeasures ? JSON.stringify(measures) : null,
          notes: sessionNotes || null,
        }),
      });
      if (res.ok) {
        toast('Sessão finalizada com sucesso!', 'success');
        // Reset form
        setNeedsPhotos(false); setNeedsMeasures(false);
        setMeasures({ ...EMPTY_MEASURES }); setSessionPhotos([]); setSessionNotes('');
        loadData();
      } else {
        toast('Erro ao finalizar sessão', 'error');
      }
    } catch { toast('Erro de conexão', 'error'); }
    setSaving(false);
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const getAge = (birthdate: string | null) => {
    if (!birthdate) return null;
    const b = new Date(birthdate);
    return Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  };

  if (loading) return (
    <AuthGuard><AppHeader activePage="pacotes" />
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 40, animation: 'spin 1s linear infinite' }}>progress_activity</span>
        <p style={{ marginTop: 12, fontWeight: 700 }}>Carregando ficha...</p>
      </div>
    </AuthGuard>
  );

  if (!client) return (
    <AuthGuard><AppHeader activePage="pacotes" />
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48 }}>person_off</span>
        <p style={{ marginTop: 12, fontWeight: 700 }}>Paciente não encontrado</p>
        <Link href="/pacotes/pacientes" style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.88rem' }}>← Voltar para Pacientes</Link>
      </div>
    </AuthGuard>
  );

  const nextSession = activePkg ? (activePkg.completedSessions || 0) + 1 : 1;
  const totalS = activePkg?.totalSessions || 1;
  const completedS = activePkg?.completedSessions || 0;
  const progressPct = Math.min(100, (completedS / totalS) * 100);
  const isComplete = completedS >= totalS;

  // Parse services for display
  let servicesArr: { name: string }[] = [];
  try { if (activePkg?.services) servicesArr = JSON.parse(activePkg.services); } catch { /* ignore */ }
  const treatmentName = servicesArr.map(s => s.name).join(', ') || 'Tratamento';

  // Parse quoteData for display
  let procedures: { name: string; quantity: number; unitPrice: string; discount: string }[] = [];
  try { if (client.quoteData) procedures = JSON.parse(client.quoteData); } catch { /* ignore */ }

  // First & last session measures for comparison
  const firstSession = sessions.find(s => s.sessionNumber === 1);
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  let firstMeasures: Measures | null = null;
  let lastMeasures: Measures | null = null;
  try { if (firstSession?.measures) firstMeasures = JSON.parse(firstSession.measures); } catch { /* ignore */ }
  try { if (lastSession?.measures && lastSession.id !== firstSession?.id) lastMeasures = JSON.parse(lastSession.measures); } catch { /* ignore */ }

  return (
    <AuthGuard>
      <AppHeader activePage="pacotes" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
        {/* Back */}
        <Link href="/pacotes/pacientes" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span> Voltar para Pacientes
        </Link>

        {/* Patient Header Card */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', padding: 24, marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #6366f1, #e600a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem', fontWeight: 900, flexShrink: 0 }}>
            {getInitials(client.name)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900 }}>{client.name}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {client.phone && <span>📱 {client.phone}</span>}
              {client.email && <span>✉️ {client.email}</span>}
              {client.cpf && <span>🪪 {client.cpf}</span>}
              {getAge(client.birthdate) && <span>🎂 {getAge(client.birthdate)} anos</span>}
            </div>
          </div>
          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setTab('info')} style={{ padding: '10px 16px', borderRadius: 12, border: tab === 'info' ? '2px solid var(--primary)' : '1px solid var(--border)', background: tab === 'info' ? 'rgba(99,102,241,0.06)' : 'var(--card-bg)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, color: tab === 'info' ? 'var(--primary)' : 'var(--text-main)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person</span> Informações
            </button>
            <button onClick={() => setTab('evolucao')} style={{ padding: '10px 16px', borderRadius: 12, border: tab === 'evolucao' ? '2px solid var(--primary)' : '1px solid var(--border)', background: tab === 'evolucao' ? 'rgba(99,102,241,0.06)' : 'var(--card-bg)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, color: tab === 'evolucao' ? 'var(--primary)' : 'var(--text-main)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>monitoring</span> Evolução
            </button>
            <button onClick={() => setTab('contrato')} style={{ padding: '10px 16px', borderRadius: 12, border: tab === 'contrato' ? '2px solid #10b981' : '1px solid var(--border)', background: tab === 'contrato' ? 'rgba(16,185,129,0.06)' : 'var(--card-bg)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, color: tab === 'contrato' ? '#10b981' : 'var(--text-main)', position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>description</span> Contrato
              {allContracts.some(c => c.status === 'assinado') && (
                <span style={{ width: 8, height: 8, borderRadius: 4, background: '#10b981', position: 'absolute', top: 6, right: 6 }} />
              )}
            </button>
          </div>
        </div>

        {/* ═══ TAB: Informações ═══ */}
        {tab === 'info' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Personal Info */}
            <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>badge</span> Dados Pessoais
              </h3>
              {[
                { icon: 'person', label: 'Nome Completo', value: client.name },
                { icon: 'cake', label: 'Data de Nascimento', value: client.birthdate || '—' },
                { icon: 'wc', label: 'Sexo', value: client.gender ? (client.gender === 'feminino' ? 'Feminino' : client.gender === 'masculino' ? 'Masculino' : client.gender) : '—' },
                { icon: 'mail', label: 'Email', value: client.email || '—' },
                { icon: 'call', label: 'Telefone', value: client.phone || '—' },
                { icon: 'id_card', label: 'CPF', value: client.cpf || '—' },
                { icon: 'id_card', label: 'RG', value: client.rg || '—' },
                { icon: 'work', label: 'Profissão', value: client.profissao || '—' },
                { icon: 'favorite', label: 'Estado Civil', value: client.estadoCivil || '—' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)', opacity: 0.6 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Address + Financial */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Address */}
              <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>location_on</span> Endereço
                </h3>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.8, color: 'var(--text-main)' }}>
                  {client.rua ? `${client.rua}${client.numero ? `, ${client.numero}` : ''}` : '—'}
                  {client.bairro && <><br />{client.bairro}</>}
                  {client.cidade && <><br />{client.cidade}{client.estado ? ` - ${client.estado}` : ''}</>}
                  {client.cep && <><br />CEP: {client.cep}</>}
                </div>
              </div>

              {/* Orçamento/Procedimentos */}
              {procedures.length > 0 && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>spa</span> Procedimentos
                  </h3>
                  {procedures.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{p.quantity}x</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {client.paymentMethod === 'pix' ? '⚡ Pix' : client.paymentMethod === 'credito' ? `💳 ${client.installments}x` : client.paymentMethod === 'link' ? `🔗 ${client.installments}x` : client.paymentMethod === 'debito' ? '💳 Débito' : client.paymentMethod === 'dinheiro' ? '💵 Dinheiro' : ''}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: '#10b981' }}>{fmt(client.quoteValue || 0)}</span>
                  </div>
                </div>
              )}

              {/* Packages */}
              {packages.length > 0 && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>inventory_2</span> Pacotes Fechados
                  </h3>
                  {packages.map(pkg => (
                    <div key={pkg.id} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 8, background: activePkg?.id === pkg.id ? 'rgba(99,102,241,0.04)' : 'transparent' }}>
                      <div onClick={() => { setActivePkg(pkg); loadSessions(pkg.id); setTab('evolucao'); }} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{(() => { try { return JSON.parse(pkg.services).map((s: any) => s.name).join(', '); } catch { return 'Pacote'; } })()}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: pkg.status === 'ativo' ? 'rgba(16,185,129,0.08)' : pkg.status === 'concluido' ? 'rgba(99,102,241,0.08)' : 'rgba(239,68,68,0.08)', color: pkg.status === 'ativo' ? '#10b981' : pkg.status === 'concluido' ? '#6366f1' : '#ef4444' }}>
                            {pkg.status === 'ativo' ? 'Ativo' : pkg.status === 'concluido' ? 'Concluído' : 'Cancelado'}
                          </span>
                        </div>
                        <div style={{ background: 'var(--bg)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 6, background: `linear-gradient(90deg, #6366f1, #e600a0)`, width: `${Math.min(100, (pkg.completedSessions / pkg.totalSessions) * 100)}%`, transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          <span>{pkg.completedSessions}/{pkg.totalSessions} sessões</span>
                          <span>{fmt(pkg.totalValue)}</span>
                        </div>
                      </div>
                      {/* Contract Status */}
                      <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        {contractMap[pkg.id]?.status === 'assinado' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, fontSize: '0.76rem', fontWeight: 700, width: '100%', justifyContent: 'center', background: 'rgba(16,185,129,0.08)', color: '#10b981' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified</span>
                            Contrato Assinado ✅
                          </div>
                        ) : contractMap[pkg.id] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, fontSize: '0.76rem', fontWeight: 700, width: '100%', justifyContent: 'center', background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>description</span>
                            Contrato Pendente de Assinatura
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleContract(pkg); }}
                            disabled={creatingContract === pkg.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, border: 'none', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center', background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>note_add</span>
                            {creatingContract === pkg.id ? 'Gerando...' : 'Gerar Contrato Digital'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: Contrato ═══ */}
        {tab === 'contrato' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {allContracts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48 }}>description</span>
                <p style={{ marginTop: 12, fontWeight: 700 }}>Nenhum contrato encontrado</p>
                <p style={{ fontSize: '0.82rem' }}>Gere um contrato na aba Informações → Pacotes Fechados.</p>
              </div>
            ) : (
              allContracts.map((contract: any) => {
                const isSigned = contract.status === 'assinado';
                const isPending = contract.status === 'pendente';
                const shareUrl = contract.signingToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/assinar/${contract.signingToken}` : null;

                return (
                  <div key={contract.id} style={{ background: 'var(--card-bg)', borderRadius: 16, border: isSigned ? '2px solid #10b981' : '1px solid var(--border)', overflow: 'hidden' }}>
                    {/* Contract Header */}
                    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: isSigned ? 'linear-gradient(135deg,#10b981,#059669)' : isPending ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>
                          {isSigned ? 'verified' : isPending ? 'pending' : 'description'}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>{contract.templateName || 'Contrato'}</h4>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Gerado em {new Date(contract.createdAt).toLocaleDateString('pt-BR')} • {contract.unit || '—'}
                        </p>
                      </div>
                      <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800,
                        background: isSigned ? 'rgba(16,185,129,0.08)' : isPending ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)',
                        color: isSigned ? '#10b981' : isPending ? '#f59e0b' : '#6366f1'
                      }}>
                        {isSigned ? '✅ Assinado' : isPending ? '⏳ Pendente' : '📄 Gerado'}
                      </span>
                    </div>

                    {/* Contract Details */}
                    <div style={{ padding: '16px 20px' }}>
                      {/* Signature Info */}
                      {isSigned && contract.signedAt && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                          <div>
                            <p style={{ margin: '0 0 2px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Assinado em</p>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>{new Date(contract.signedAt).toLocaleString('pt-BR')}</p>
                          </div>
                          {contract.signatureIp && (
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>IP</p>
                              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>{contract.signatureIp}</p>
                            </div>
                          )}
                          {contract.clientCpf && (
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>CPF</p>
                              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>{contract.clientCpf}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {/* View signed contract */}
                        {isSigned && shareUrl && (
                          <a href={shareUrl} target="_blank" rel="noopener noreferrer" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
                            background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                            textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                            Ver Contrato Assinado
                          </a>
                        )}

                        {/* Share / Copy Link */}
                        {shareUrl && (
                          <button onClick={async () => {
                            await navigator.clipboard.writeText(shareUrl);
                            setCopiedLink(contract.id);
                            toast('Link copiado!', 'success');
                            setTimeout(() => setCopiedLink(null), 3000);
                          }} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
                            background: copiedLink === contract.id ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.08)',
                            color: copiedLink === contract.id ? '#10b981' : '#6366f1',
                            fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                              {copiedLink === contract.id ? 'check' : 'content_copy'}
                            </span>
                            {copiedLink === contract.id ? 'Link Copiado!' : 'Copiar Link'}
                          </button>
                        )}

                        {/* Share via WhatsApp */}
                        {shareUrl && (
                          <a href={`https://wa.me/?text=${encodeURIComponent(`📄 Contrato - ${client.name}\n\nAcesse o contrato pelo link:\n${shareUrl}`)}`}
                            target="_blank" rel="noopener noreferrer" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
                              background: 'rgba(37,211,102,0.08)', color: '#25d366',
                              fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            <span style={{ fontSize: 16 }}>📱</span>
                            WhatsApp
                          </a>
                        )}

                        {/* Navigate to contract generator if no signing token */}
                        {!shareUrl && (
                          <button onClick={() => router.push(`/termos?contract=${contract.id}`)} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
                            background: 'rgba(99,102,241,0.08)', color: '#6366f1',
                            fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
                            Ver no Termos
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ TAB: Evolução ═══ */}
        {tab === 'evolucao' && (
          <>
            {!activePkg ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48 }}>inventory_2</span>
                <p style={{ marginTop: 12, fontWeight: 700 }}>Nenhum pacote encontrado para este paciente.</p>
                <p style={{ fontSize: '0.82rem' }}>Crie uma Venda no módulo Vendas para iniciar o acompanhamento.</p>
              </div>
            ) : (
              <>
                {/* Treatment Progress Card */}
                <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900 }}>{treatmentName}</h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {completedS} de {totalS} sessões realizadas • {totalS - completedS} restante(s)
                      </span>
                    </div>
                    <span style={{ fontSize: '1.3rem', fontWeight: 900, color: isComplete ? '#10b981' : 'var(--primary)' }}>
                      {completedS}/{totalS}
                    </span>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, height: 16, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 10, background: isComplete ? '#10b981' : `linear-gradient(90deg, #6366f1, #e600a0)`, width: `${progressPct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                  {isComplete && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)', textAlign: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#10b981', verticalAlign: 'middle' }}>celebration</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', marginLeft: 8 }}>Tratamento Concluído!</span>
                    </div>
                  )}
                </div>

                {/* Session Check-in */}
                {!isComplete && (
                  <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '2px solid var(--primary)', padding: 24, marginBottom: 20 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>event_available</span>
                      Sessão {nextSession} — {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </h3>
                    <p style={{ margin: '0 0 20px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Registre os dados desta sessão antes de finalizar</p>

                    {/* Toggles */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                      <button onClick={() => setNeedsPhotos(!needsPhotos)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 14, border: needsPhotos ? '2px solid #6366f1' : '2px solid var(--border)', background: needsPhotos ? 'rgba(99,102,241,0.06)' : 'var(--card-bg)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', color: needsPhotos ? '#6366f1' : 'var(--text-muted)', transition: 'all 0.2s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{needsPhotos ? 'photo_camera' : 'no_photography'}</span>
                        Esta sessão precisa de FOTOS?
                        <span style={{ width: 40, height: 22, borderRadius: 11, background: needsPhotos ? '#6366f1' : 'var(--border)', position: 'relative', transition: 'background 0.2s', marginLeft: 8 }}>
                          <span style={{ position: 'absolute', top: 2, left: needsPhotos ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                        </span>
                      </button>
                      <button onClick={() => setNeedsMeasures(!needsMeasures)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 14, border: needsMeasures ? '2px solid #e600a0' : '2px solid var(--border)', background: needsMeasures ? 'rgba(230,0,160,0.04)' : 'var(--card-bg)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', color: needsMeasures ? '#e600a0' : 'var(--text-muted)', transition: 'all 0.2s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{needsMeasures ? 'straighten' : 'rule'}</span>
                        Esta sessão precisa de MEDIDAS?
                        <span style={{ width: 40, height: 22, borderRadius: 11, background: needsMeasures ? '#e600a0' : 'var(--border)', position: 'relative', transition: 'background 0.2s', marginLeft: 8 }}>
                          <span style={{ position: 'absolute', top: 2, left: needsMeasures ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                        </span>
                      </button>
                    </div>

                    {/* Conditional: Photos */}
                    {needsPhotos && (
                      <div style={{ marginBottom: 20, padding: 20, borderRadius: 14, background: 'rgba(99,102,241,0.03)', border: '1px dashed rgba(99,102,241,0.2)' }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>add_a_photo</span>
                          Fotos — Antes e Depois / Evolução
                        </h4>
                        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                        <div onClick={() => fileRef.current?.click()} style={{ padding: 30, borderRadius: 12, border: '2px dashed var(--border)', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.03)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#6366f1', opacity: 0.5 }}>cloud_upload</span>
                          <p style={{ margin: '8px 0 0', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>Clique ou arraste fotos aqui</p>
                        </div>
                        {sessionPhotos.length > 0 && (
                          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                            {sessionPhotos.map((p, i) => (
                              <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--border)' }}>
                                <img src={p.data} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button onClick={() => setSessionPhotos(prev => prev.filter((_, j) => j !== i))}
                                  style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, background: 'rgba(239,68,68,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>close</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Conditional: Measures */}
                    {needsMeasures && (
                      <div style={{ marginBottom: 20, padding: 20, borderRadius: 14, background: 'rgba(230,0,160,0.02)', border: '1px solid rgba(230,0,160,0.1)' }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#e600a0' }}>straighten</span>
                          Medidas Corporais
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                          {(Object.keys(MEASURE_LABELS) as (keyof Measures)[]).map(key => (
                            <div key={key}>
                              <label style={labelS}>{MEASURE_LABELS[key]}</label>
                              <input type="number" step="0.1" value={measures[key]} onChange={e => setMeasures(prev => ({ ...prev, [key]: e.target.value }))}
                                style={{ ...inputS, height: 38, fontSize: '0.82rem' }} placeholder="0" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={labelS}>Observações da Sessão</label>
                      <textarea value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} rows={3}
                        style={{ ...inputS, height: 'auto', resize: 'vertical' }} placeholder="Anotações opcionais..." />
                    </div>

                    {/* Finalize Button */}
                    <button onClick={handleFinalizeSession} disabled={saving}
                      style={{ width: '100%', padding: '16px 24px', borderRadius: 14, border: 'none', background: (needsPhotos && sessionPhotos.length === 0) || (needsMeasures && Object.values(measures).every(v => !v.trim())) ? '#ccc' : 'linear-gradient(135deg, #6366f1, #e600a0)', color: '#fff', fontSize: '0.92rem', fontWeight: 900, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                      {saving ? 'Salvando...' : `Finalizar Sessão ${nextSession}`}
                    </button>
                    {((needsPhotos && sessionPhotos.length === 0) || (needsMeasures && Object.values(measures).every(v => !v.trim()))) && (
                      <p style={{ marginTop: 8, fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, textAlign: 'center' }}>
                        ⚠️ {needsPhotos && sessionPhotos.length === 0 ? 'Upload de fotos obrigatório. ' : ''}{needsMeasures && Object.values(measures).every(v => !v.trim()) ? 'Medidas obrigatórias.' : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* ═══ Timeline ═══ */}
                {sessions.length > 0 && (
                  <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', padding: 24 }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>timeline</span>
                      Linha do Tempo da Evolução
                    </h3>

                    {/* Measurement Comparison (if final session) */}
                    {isComplete && firstMeasures && lastMeasures && (
                      <div style={{ marginBottom: 24, padding: 20, borderRadius: 16, background: 'linear-gradient(135deg, rgba(99,102,241,0.03), rgba(230,0,160,0.03))', border: '1px solid rgba(99,102,241,0.1)' }}>
                        <h4 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>compare_arrows</span>
                          Comparativo: Sessão 1 vs Sessão {sessions.length}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                          {(Object.keys(MEASURE_LABELS) as (keyof Measures)[]).map(key => {
                            const initial = parseFloat(firstMeasures![key]) || 0;
                            const final_ = parseFloat(lastMeasures![key]) || 0;
                            const diff = final_ - initial;
                            if (!initial && !final_) return null;
                            return (
                              <div key={key} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{MEASURE_LABELS[key].split('(')[0].trim()}</div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{initial} → {final_}</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: diff < 0 ? '#10b981' : diff > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Timeline nodes */}
                    <div style={{ position: 'relative', paddingLeft: 28 }}>
                      {/* Vertical line */}
                      <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />

                      {[...sessions].reverse().map((session, i) => {
                        let sessionMeasures: Measures | null = null;
                        let sessionPics: { label: string; data: string }[] = [];
                        try { if (session.measures) sessionMeasures = JSON.parse(session.measures); } catch { /* ignore */ }
                        try { if (session.photos) sessionPics = JSON.parse(session.photos); } catch { /* ignore */ }
                        const isFinal = session.sessionNumber === totalS;

                        return (
                          <div key={session.id} style={{ position: 'relative', marginBottom: 24 }}>
                            {/* Dot */}
                            <div style={{ position: 'absolute', left: -22, top: 4, width: 16, height: 16, borderRadius: 8, background: isFinal ? '#10b981' : '#6366f1', border: '3px solid var(--card-bg)', boxShadow: '0 0 0 2px ' + (isFinal ? '#10b981' : '#6366f1') }} />
                            {/* Content */}
                            <div style={{ padding: '14px 18px', borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontWeight: 900, fontSize: '0.88rem' }}>
                                  Sessão {session.sessionNumber}{isFinal ? ' 🎉 Final' : ''}
                                </span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>{fmtDate(session.date)}</span>
                              </div>
                              {session.professional && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>Profissional: {session.professional}</div>}

                              {/* Photos thumbnails */}
                              {sessionPics.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                  {sessionPics.map((p, j) => (
                                    <img key={j} src={p.data} alt={p.label} style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '2px solid var(--border)', cursor: 'pointer' }} />
                                  ))}
                                </div>
                              )}

                              {/* Measures snapshot */}
                              {sessionMeasures && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {(Object.keys(MEASURE_LABELS) as (keyof Measures)[]).map(key => {
                                    if (!sessionMeasures![key]) return null;
                                    return (
                                      <span key={key} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(230,0,160,0.06)', color: '#e600a0' }}>
                                        {MEASURE_LABELS[key].split('(')[0].trim()}: {sessionMeasures![key]}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {session.notes && <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, fontStyle: 'italic' }}>💬 {session.notes}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </AuthGuard>
  );
}
