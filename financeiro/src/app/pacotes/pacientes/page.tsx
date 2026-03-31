'use client';
import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useRouter } from 'next/navigation';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  cpf: string | null; gender: string | null; birthdate: string | null;
  stage: string; quoteValue: number | null; createdAt: string;
  unit: string; isActive: boolean;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function PacientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [contractStatusMap, setContractStatusMap] = useState<Record<string, string>>({});
  const router = useRouter();

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    try {
      const cRes = await fetch('/api/clients?limit=500');
      const cData = await cRes.json();
      const registeredClients: Client[] = cData.clients || [];

      const pRes = await fetch('/api/packages');
      const pData = await pRes.json();
      const packages = pData.packages || [];

      const registeredNames = new Set(registeredClients.map(c => c.name.toLowerCase()));

      const pkgOnlyClients: Client[] = [];
      const seenPkgNames = new Set<string>();
      for (const pkg of packages) {
        const lowerName = (pkg.clientName || '').toLowerCase();
        if (!lowerName || registeredNames.has(lowerName) || seenPkgNames.has(lowerName)) continue;
        seenPkgNames.add(lowerName);
        pkgOnlyClients.push({
          id: pkg.clientId || `pkg-${pkg.id}`,
          name: pkg.clientName,
          phone: null, email: null, cpf: null, gender: null, birthdate: null,
          stage: 'venda',
          quoteValue: pkg.totalValue,
          createdAt: pkg.createdAt,
          unit: pkg.unit || 'Barueri',
          isActive: pkg.status === 'ativo',
        });
      }

      const allClients = [...registeredClients, ...pkgOnlyClients];
      setClients(allClients);
      fetchContractStatuses();
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function fetchContractStatuses() {
    try {
      const res = await fetch('/api/contracts');
      const data = await res.json();
      const contracts = data.contracts || [];
      const sMap: Record<string, string> = {};
      for (const c of contracts) {
        if (c.clientName && !sMap[c.clientName]) {
          sMap[c.clientName] = c.status || 'gerado';
        }
      }
      setContractStatusMap(sMap);
    } catch { /* ignore */ }
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').includes(searchTerm) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.cpf || '').includes(searchTerm)
  );

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const getAge = (birthdate: string | null) => {
    if (!birthdate) return null;
    const b = new Date(birthdate);
    const diff = Date.now() - b.getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    orcamento: { label: 'Orçamento', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    venda: { label: 'Venda', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
    entrada: { label: 'Novo', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
    em_andamento: { label: 'Em Andamento', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
    avaliacao: { label: 'Avaliação', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  };

  return (
    <AuthGuard>
      <AppHeader activePage="pacotes" />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, verticalAlign: 'middle', marginRight: 8, color: 'var(--primary)' }}>group</span>
              Pacientes
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {clients.length} paciente(s) cadastrado(s)
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total', value: clients.length, icon: 'group', color: '#6366f1' },
            { label: 'Orçamentos', value: clients.filter(c => c.stage === 'orcamento').length, icon: 'request_quote', color: '#f59e0b' },
            { label: 'Vendas', value: clients.filter(c => c.stage === 'venda').length, icon: 'check_circle', color: '#10b981' },
            { label: 'Valor Total', value: fmt(clients.reduce((s, c) => s + (c.quoteValue || 0), 0)), icon: 'payments', color: '#e600a0' },
          ].map((kpi, i) => (
            <div key={i} style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${kpi.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
              </div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{typeof kpi.value === 'number' ? kpi.value : kpi.value}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>search</span>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, telefone, email ou CPF..."
            style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '0.88rem', fontFamily: 'inherit', fontWeight: 600, color: 'var(--text-main)' }} />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>close</span>
            </button>
          )}
        </div>

        {/* Patient List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, animation: 'spin 1s linear infinite' }}>progress_activity</span>
            <p style={{ marginTop: 12, fontWeight: 700 }}>Carregando pacientes...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48 }}>person_off</span>
            <p style={{ marginTop: 12, fontWeight: 700 }}>Nenhum paciente encontrado</p>
          </div>
        ) : (
          <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 140px 120px 120px 140px', alignItems: 'center', padding: '12px 20px', borderBottom: '2px solid var(--border)', gap: 12 }}>
              {['', 'Paciente', 'Contato', 'Valor', 'Status', 'Contrato'].map((h, i) => (
                <span key={i} style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {/* Rows */}
            {filtered.map(client => {
              const st = statusMap[client.stage] || statusMap.entrada;
              const age = getAge(client.birthdate);
              const cStatus = contractStatusMap[client.name];
              return (
                <div key={client.id}
                  onClick={() => router.push(`/pacotes/pacientes/${client.id}`)}
                  style={{ display: 'grid', gridTemplateColumns: '48px 1fr 140px 120px 120px 140px', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 12, transition: 'background 0.15s', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {/* Avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #e600a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.72rem', fontWeight: 900 }}>
                    {getInitials(client.name)}
                  </div>
                  {/* Name + info */}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>{client.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: 8, marginTop: 2 }}>
                      {client.cpf && <span>CPF: {client.cpf}</span>}
                      {age && <span>• {age} anos</span>}
                      {client.gender && <span>• {client.gender === 'feminino' ? '♀' : client.gender === 'masculino' ? '♂' : ''}</span>}
                    </div>
                  </div>
                  {/* Contact */}
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {client.phone || client.email || '—'}
                  </div>
                  {/* Value */}
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: (client.quoteValue || 0) > 0 ? '#10b981' : 'var(--text-muted)' }}>
                    {(client.quoteValue || 0) > 0 ? fmt(client.quoteValue!) : '—'}
                  </div>
                  {/* Status */}
                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  {/* Contract Status */}
                  <div>
                    {cStatus === 'assinado' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.08)', color: '#10b981' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                        Assinado
                      </span>
                    ) : cStatus === 'pendente' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span>
                        Pendente
                      </span>
                    ) : cStatus ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span>
                        Gerado
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Mostrando {filtered.length} de {clients.length} paciente(s)
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
