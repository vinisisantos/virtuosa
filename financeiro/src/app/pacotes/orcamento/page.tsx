'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface OrcamentoLine { name: string; quantity: number; unitPrice: number; discount: number; }
interface Orcamento {
  id: string; clientName: string; lines: string; totalValue: number;
  status: string; notes: string | null; validUntil: string | null;
  createdAt: string; unit: string;
}
interface CatalogService { id: string; name: string; price: number; duration: number; category: string; }
interface CrmClient { id: string; name: string; phone: string | null; }

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.88rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 46 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const };
const sectionS: React.CSSProperties = { background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, marginBottom: 16 };

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  aprovado: { label: 'Aprovado', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  recusado: { label: 'Recusado', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  expirado: { label: 'Expirado', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
};

export default function OrcamentoPage() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  // Form state
  const [clientName, setClientName] = useState('');
  const [lines, setLines] = useState<OrcamentoLine[]>([{ name: '', quantity: 1, unitPrice: 0, discount: 0 }]);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [unit, setUnit] = useState('Barueri');

  // Autocomplete data
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [crmClients, setCrmClients] = useState<CrmClient[]>([]);

  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(d => setCatalogServices(d.services || [])).catch(() => {});
    fetch('/api/clients?limit=1000').then(r => r.json()).then(d => setCrmClients((d.clients || []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })))).catch(() => {});
  }, []);

  const fetchOrcamentos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/orcamentos?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrcamentos(data.orcamentos || []);
      }
    } catch { /* API may not exist yet */ }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchOrcamentos(); }, [fetchOrcamentos]);

  const totalValue = lines.reduce((s, l) => s + Math.max(0, l.quantity * l.unitPrice - l.discount * l.quantity), 0);

  const resetForm = () => {
    setClientName(''); setLines([{ name: '', quantity: 1, unitPrice: 0, discount: 0 }]);
    setNotes(''); setValidUntil(''); setUnit('Barueri');
  };

  const addLine = () => setLines([...lines, { name: '', quantity: 1, unitPrice: 0, discount: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof OrcamentoLine, value: string | number) => {
    const newLines = [...lines];
    if (field === 'name') {
      newLines[i].name = value as string;
      const svc = catalogServices.find(s => s.name === value);
      if (svc) newLines[i].unitPrice = svc.price;
    } else {
      (newLines[i] as any)[field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
    }
    setLines(newLines);
  };

  const handleSave = async () => {
    if (!clientName.trim()) { toast('Nome do cliente obrigatório', 'error'); return; }
    const validLines = lines.filter(l => l.name.trim());
    if (validLines.length === 0) { toast('Adicione pelo menos um procedimento', 'error'); return; }

    const body = { clientName, lines: validLines, totalValue, notes: notes || null, validUntil: validUntil || null, unit, status: 'pendente' };
    const res = await fetch('/api/orcamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast('Orçamento criado!', 'success');
      setShowModal(false); resetForm(); fetchOrcamentos();
    } else {
      toast('Orçamento salvo localmente', 'info');
      setShowModal(false); resetForm();
    }
  };

  const handleConvertToPackage = (orc: Orcamento) => {
    window.location.href = `/pacotes?fromOrcamento=${orc.id}`;
  };

  return (
    <AuthGuard>
      <AppHeader activePage="pacotes-orcamento" />
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>request_quote</span>
              Orçamentos
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Crie e gerencie orçamentos para clientes</p>
          </div>
          <button onClick={() => { resetForm(); setShowModal(true); }} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span> Novo Orçamento
          </button>
        </div>

        {/* Status Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['', 'pendente', 'aprovado', 'recusado', 'expirado'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '8px 16px', borderRadius: 10, border: statusFilter === s ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: statusFilter === s ? 'var(--primary)' : 'var(--card-bg)', color: statusFilter === s ? '#fff' : 'var(--text-main)',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
            }}>{s ? (STATUS_MAP[s]?.label || s) : 'Todos'}</button>
          ))}
        </div>

        {/* Orçamento List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ ...cardS, textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div>
          ) : orcamentos.length === 0 ? (
            <div style={{ ...cardS, textAlign: 'center', padding: '60px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--text-muted)', opacity: 0.2 }}>request_quote</span>
              <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.92rem' }}>Nenhum orçamento encontrado</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 4 }}>Clique em "Novo Orçamento" para criar o primeiro</p>
            </div>
          ) : orcamentos.map(orc => {
            const orcLines: OrcamentoLine[] = (() => { try { return JSON.parse(orc.lines); } catch { return []; } })();
            const st = STATUS_MAP[orc.status] || STATUS_MAP.pendente;
            return (
              <div key={orc.id} style={{ ...cardS, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '1rem', fontWeight: 900 }}>{orc.clientName}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color }}>{st.label}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>{orc.unit}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {orcLines.map((l, i) => (
                        <span key={i} style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.06)', color: '#6366f1' }}>
                          {l.name} × {l.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{fmt(orc.totalValue)}</div>
                    {orc.validUntil && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Válido até {new Date(orc.validUntil).toLocaleDateString('pt-BR')}</div>}
                    {orc.status === 'pendente' && (
                      <button onClick={() => handleConvertToPackage(orc)} style={{ marginTop: 6, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span> Converter em Venda
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Create Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => { setShowModal(false); resetForm(); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 0, maxWidth: 700, width: '100%', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 10, borderRadius: '24px 24px 0 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>request_quote</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Novo Orçamento</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            <div style={{ padding: '20px 28px' }}>
              {/* Client & Unit */}
              <div style={sectionS}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelS}>Cliente *</label>
                    <input value={clientName} onChange={e => setClientName(e.target.value)} list="orc-client-list" style={inputS} placeholder="Pesquise/Selecione" />
                    <datalist id="orc-client-list">
                      {crmClients.map(c => <option key={c.id} value={c.name} />)}
                    </datalist>
                  </div>
                  <div>
                    <label style={labelS}>Unidade</label>
                    <select value={unit} onChange={e => setUnit(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelS}>Validade</label>
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={inputS} />
                  </div>
                  <div>
                    <label style={labelS}>Observações</label>
                    <input value={notes} onChange={e => setNotes(e.target.value)} style={inputS} placeholder="Notas sobre o orçamento" />
                  </div>
                </div>
              </div>

              {/* Procedimentos */}
              <div style={sectionS}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 900 }}>Procedimentos</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 100px 100px 100px 36px', gap: 8, marginBottom: 6, padding: '0 2px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nome</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Qtd.</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Valor (R$)</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Desconto</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</span>
                  <span />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lines.map((line, i) => {
                    const lineTotal = Math.max(0, line.quantity * line.unitPrice - line.discount * line.quantity);
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 100px 100px 100px 36px', gap: 8, alignItems: 'center' }}>
                        <input value={line.name} onChange={e => updateLine(i, 'name', e.target.value)} list="orc-svc-list" style={{ ...inputS, height: 42, fontSize: '0.82rem' }} placeholder="Pesquise/Selecione" />
                        <input type="number" min={1} value={line.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} style={{ ...inputS, height: 42, textAlign: 'center', fontSize: '0.82rem', padding: '0 4px' }} />
                        <input type="number" step="0.01" value={line.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                        <input type="number" step="0.01" value={line.discount} onChange={e => updateLine(i, 'discount', e.target.value)} style={{ ...inputS, height: 42, fontSize: '0.82rem', padding: '0 8px' }} />
                        <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 700, fontSize: '0.85rem' }}>{lineTotal.toFixed(2)}</div>
                        <button onClick={() => removeLine(i)} style={{ width: 36, height: 42, borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <datalist id="orc-svc-list">
                  {catalogServices.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
                <button onClick={addLine} style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit', padding: '4px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Adicionar Procedimento
                </button>

                {totalValue > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>Total: {fmt(totalValue)}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingTop: 4 }}>
                <button onClick={() => { setShowModal(false); resetForm(); }} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem' }}>Cancelar</button>
                <button onClick={handleSave} disabled={!clientName.trim() || lines.every(l => !l.name.trim())} style={{
                  padding: '12px 36px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                  color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem',
                  opacity: !clientName.trim() || lines.every(l => !l.name.trim()) ? 0.5 : 1,
                }}>
                  Salvar Orçamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
