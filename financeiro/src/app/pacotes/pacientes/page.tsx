'use client';
import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import { useGlobalUnit } from '@/contexts/UnitContext';
import AuthGuard from '@/components/auth-guard';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/toast';
import { PatientAutocomplete, PatientData } from '@/components/patient-autocomplete';
import { formatCurrency as fmt } from '@/lib/currency';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  cpf: string | null; gender: string | null; birthdate: string | null;
  stage: string; quoteValue: number | null; createdAt: string;
  unit: string; isActive: boolean;
}

export default function PacientesPage() {
  const { globalUnit, units: UNITS } = useGlobalUnit();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [contractStatusMap, setContractStatusMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const router = useRouter();

  useEffect(() => { fetchClients(); }, [globalUnit]);

  async function fetchClients() {
    setLoading(true);
    try {
      // Active clients — shown in the list
      const unitParam = globalUnit ? `&unit=${encodeURIComponent(globalUnit)}` : '';
      const cRes = await fetch(`/api/clients?limit=500${unitParam}`);
      const cData = await cRes.json();
      const registeredClients: Client[] = cData.clients || [];

      // All clients including soft-deleted — used only to prevent ghost reappearance
      const allCRes = await fetch(`/api/clients?limit=2000&includeInactive=true${unitParam}`);
      const allCData = await allCRes.json();
      const allRegisteredClients: Client[] = allCData.clients || registeredClients;

      const pRes = await fetch(`/api/packages?${globalUnit ? `unit=${encodeURIComponent(globalUnit)}` : ''}`);
      const pData = await pRes.json();
      const packages = pData.packages || [];

      // Include inactive clients in the name-set so soft-deleted clients don't reappear as pkg-only
      const registeredNames = new Set(allRegisteredClients.map(c => c.name.toLowerCase()));

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
          unit: pkg.unit || 'SCS',
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

  /* ── Selection helpers ── */
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.id)));
    }
  };

  const isAllSelected = filtered.length > 0 && selected.size === filtered.length;
  const hasSelection = selected.size > 0;

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const allIds = Array.from(selected);
      const realIds = allIds.filter(id => !id.startsWith('pkg-'));
      const pkgIds = allIds.filter(id => id.startsWith('pkg-'));

      // Delete real clients (soft-delete via API)
      if (realIds.length > 0) {
        const res = await fetch('/api/clients', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: realIds }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || 'Erro ao excluir pacientes', 'error');
          setDeleting(false);
          setShowConfirm(false);
          return;
        }
      }

      // For pkg-only clients: delete their packages AND create a deactivated
      // client record so the name doesn't reappear from leftover packages
      for (const pkgId of pkgIds) {
        const cleanId = pkgId.replace('pkg-', '');
        const client = clients.find(c => c.id === pkgId);

        // Delete the package using query parameter (API reads from searchParams)
        try {
          await fetch(`/api/packages?id=${encodeURIComponent(cleanId)}`, {
            method: 'DELETE',
          });
        } catch { /* silent */ }

        // Also delete ALL packages with the same clientName to avoid ghosts
        if (client) {
          try {
            await fetch('/api/packages/batch-delete-by-name', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientName: client.name }),
            });
          } catch { /* silent — endpoint may not exist yet */ }

          // Create an inactive client record so this name stays soft-deleted
          try {
            await fetch('/api/clients', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: client.name, unit: client.unit || 'SCS', force: true }),
            });
            // Immediately soft-delete the newly created client
            const lookupRes = await fetch(`/api/clients?search=${encodeURIComponent(client.name)}&includeInactive=true&limit=5`);
            const lookupData = await lookupRes.json();
            const match = (lookupData.clients || []).find((c: Client) => c.name === client.name && c.isActive);
            if (match) {
              await fetch('/api/clients', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [match.id] }),
              });
            }
          } catch { /* silent */ }
        }
      }

      const count = realIds.length + pkgIds.length;
      toast(`${count} paciente${count > 1 ? 's' : ''} excluído${count > 1 ? 's' : ''} com sucesso`, 'success');
      setSelected(new Set());
      setShowConfirm(false);
      await fetchClients();
    } catch (err) {
      console.error('Delete error:', err);
      toast('Erro ao excluir pacientes. Tente novamente.', 'error');
      setShowConfirm(false);
    }
    setDeleting(false);
  };

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
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowNewModal(true)} style={{
              padding: '12px 20px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff',
              fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
              Novo Paciente
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div data-tour="pac-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
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

        {/* Search + Selection bar */}
        <div data-tour="pac-busca" style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'stretch' }}>
          <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>search</span>
            <input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setSelected(new Set()); }}
              placeholder="Buscar por nome, telefone, email ou CPF..."
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '0.88rem', fontFamily: 'inherit', fontWeight: 600, color: 'var(--text-main)' }} />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setSelected(new Set()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>close</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Floating Selection Toolbar ── */}
        {hasSelection && (
          <div style={{
            position: 'sticky', top: 72, zIndex: 100,
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            borderRadius: 16, padding: '12px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
            boxShadow: '0 8px 30px rgba(239,68,68,0.3)',
            animation: 'tourSlide 0.3s ease',
          }}>
            <style>{`@keyframes tourSlide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>check_circle</span>
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>
                  {selected.size} paciente{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 600 }}>
                  Clique em "Excluir" para remover
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setSelected(new Set())}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700,
                  fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                Cancelar
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                style={{
                  padding: '8px 20px', borderRadius: 10, border: 'none',
                  background: '#fff', color: '#ef4444', fontWeight: 800,
                  fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  transition: 'all 0.15s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                Excluir ({selected.size})
              </button>
            </div>
          </div>
        )}

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
          <div data-tour="pac-lista" style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '44px 48px 1fr 140px 120px 120px 140px', alignItems: 'center', padding: '12px 20px', borderBottom: '2px solid var(--border)', gap: 12 }}>
              {/* Select All Checkbox */}
              <div
                onClick={toggleSelectAll}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 6,
                  border: isAllSelected ? 'none' : '2px solid var(--border)',
                  background: isAllSelected ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0,
                }}>
                  {isAllSelected && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
                  {!isAllSelected && selected.size > 0 && <div style={{ width: 10, height: 2, borderRadius: 1, background: 'var(--text-muted)' }} />}
                </div>
              </div>
              {['', 'Paciente', 'Contato', 'Valor', 'Status', 'Contrato'].map((h, i) => (
                <span key={i} style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {/* Rows */}
            {filtered.map(client => {
              const st = statusMap[client.stage] || statusMap.entrada;
              const age = getAge(client.birthdate);
              const cStatus = contractStatusMap[client.name];
              const isSelected = selected.has(client.id);
              return (
                <div key={client.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '44px 48px 1fr 140px 120px 120px 140px',
                    alignItems: 'center', padding: '14px 20px',
                    borderBottom: '1px solid var(--border)', gap: 12,
                    transition: 'all 0.15s', cursor: 'pointer',
                    background: isSelected ? 'rgba(239,68,68,0.04)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(99,102,241,0.03)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; else e.currentTarget.style.background = 'rgba(239,68,68,0.04)'; }}
                >
                  {/* Checkbox */}
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleSelect(client.id); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: isSelected ? 'none' : '2px solid var(--border)',
                      background: isSelected ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', flexShrink: 0,
                    }}>
                      {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
                    </div>
                  </div>
                  {/* Avatar */}
                  <div onClick={() => router.push(`/pacotes/pacientes/${client.id}`)} style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #e600a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.72rem', fontWeight: 900 }}>
                    {getInitials(client.name)}
                  </div>
                  {/* Name + info */}
                  <div onClick={() => router.push(`/pacotes/pacientes/${client.id}`)}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>{client.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: 8, marginTop: 2 }}>
                      {client.cpf && <span>CPF: {client.cpf}</span>}
                      {age && <span>• {age} anos</span>}
                      {client.gender && <span>• {client.gender === 'feminino' ? '♀' : client.gender === 'masculino' ? '♂' : ''}</span>}
                    </div>
                  </div>
                  {/* Contact */}
                  <div onClick={() => router.push(`/pacotes/pacientes/${client.id}`)} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {client.phone || client.email || '—'}
                  </div>
                  {/* Value */}
                  <div onClick={() => router.push(`/pacotes/pacientes/${client.id}`)} style={{ fontSize: '0.82rem', fontWeight: 800, color: (client.quoteValue || 0) > 0 ? '#10b981' : 'var(--text-muted)' }}>
                    {(client.quoteValue || 0) > 0 ? fmt(client.quoteValue!) : '—'}
                  </div>
                  {/* Status */}
                  <div onClick={() => router.push(`/pacotes/pacientes/${client.id}`)}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  {/* Contract Status */}
                  <div onClick={() => router.push(`/pacotes/pacientes/${client.id}`)}>
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
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Mostrando {filtered.length} de {clients.length} paciente(s)</span>
              {hasSelection && (
                <span style={{ color: '#ef4444', fontWeight: 700 }}>
                  {selected.size} selecionado{selected.size > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Confirmation Modal ── */}
        {showConfirm && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowConfirm(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '95%', maxWidth: 440, borderRadius: 20,
              background: 'var(--card-bg, #fff)', border: '1px solid var(--border)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
              animation: 'tourSlide 0.3s ease',
            }}>
              {/* Header */}
              <div style={{
                padding: '24px 24px 16px', textAlign: 'center',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(220,38,38,0.03))',
                borderBottom: '1px solid rgba(239,68,68,0.1)',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#fff' }}>delete_forever</span>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>
                  Confirmar Exclusão
                </h3>
                <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.5 }}>
                  Tem certeza que deseja excluir <strong style={{ color: '#ef4444' }}>{selected.size} paciente{selected.size > 1 ? 's' : ''}</strong>?
                  <br />Esta ação pode ser revertida pelo administrador.
                </p>
              </div>

              {/* Selected list preview (max 5) */}
              <div style={{ padding: '12px 24px', maxHeight: 180, overflowY: 'auto' }}>
                {Array.from(selected).slice(0, 5).map(id => {
                  const c = clients.find(cl => cl.id === id);
                  if (!c) return null;
                  return (
                    <div key={id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'linear-gradient(135deg, #6366f1, #e600a0)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '0.62rem', fontWeight: 900, flexShrink: 0,
                      }}>
                        {getInitials(c.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.phone || c.email || '—'}</div>
                      </div>
                    </div>
                  );
                })}
                {selected.size > 5 && (
                  <div style={{ padding: '8px 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>
                    ... e mais {selected.size - 5} paciente{selected.size - 5 > 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: '16px 24px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={deleting}
                  style={{
                    padding: '10px 20px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700,
                    fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  style={{
                    padding: '10px 24px', borderRadius: 12, border: 'none',
                    background: deleting ? '#999' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff', fontWeight: 800, fontSize: '0.85rem',
                    cursor: deleting ? 'wait' : 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
                  }}
                >
                  {deleting ? (
                    <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span> Excluindo...</>
                  ) : (
                    <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span> Excluir {selected.size} paciente{selected.size > 1 ? 's' : ''}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ═══ New Patient Modal ═══ */}
      {showNewModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}
          onClick={() => setShowNewModal(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, border: '1px solid var(--border)', maxWidth: 500, width: '100%', padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>person_add</span>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>Novo Paciente</h3>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Busque ou cadastre um novo paciente</p>
              </div>
              <button onClick={() => setShowNewModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
            <PatientAutocomplete
              onSelect={(patient: PatientData) => {
                setShowNewModal(false);
                toast(`Paciente "${patient.name}" selecionado!`, 'success');
                router.push(`/pacotes/pacientes/${patient.id}`);
              }}
              onClear={() => {}}
              placeholder="Buscar ou cadastrar paciente..."
              allowCreate
              unit={globalUnit || undefined}
              units={UNITS}
            />
            <p style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>
              Digite o nome e selecione um paciente existente ou clique em &quot;Cadastrar novo paciente&quot;
            </p>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
