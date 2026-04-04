'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface Payment {
  id: string; clientName: string; description: string; amount: number;
  method: string; status: string; installments: number; currentInstall: number;
  dueDate: string; paidAt: string | null; unit: string; notes: string | null; createdAt: string;
}

const METHODS: Record<string, { label: string; icon: string; color: string }> = {
  pix: { label: 'PIX', icon: '⚡', color: '#00b894' },
  credito: { label: 'Crédito', icon: '💳', color: '#6366f1' },
  debito: { label: 'Débito', icon: '💳', color: '#3b82f6' },
  dinheiro: { label: 'Dinheiro', icon: '💵', color: '#10b981' },
  transferencia: { label: 'Transf.', icon: '🏦', color: '#f59e0b' },
};
const STATUS_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  pendente: { label: 'Pendente', bg: 'rgba(245,158,11,0.08)', color: '#f59e0b' },
  pago: { label: 'Pago', bg: 'rgba(16,185,129,0.08)', color: '#10b981' },
  atrasado: { label: 'Atrasado', bg: 'rgba(239,68,68,0.08)', color: '#ef4444' },
  cancelado: { label: 'Cancelado', bg: 'rgba(148,163,184,0.08)', color: '#94a3b8' },
};
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };
const selectS: React.CSSProperties = { ...inputS };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const };

export default function PagamentosPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState({ totalReceived: 0, totalPending: 0, totalOverdue: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ clientName: '', description: '', amount: '', method: 'pix', dueDate: '', installments: '1', unit: 'Barueri', notes: '' });

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/payments?${params}`);
    const data = await res.json();
    setPayments(data.payments || []);
    setStats(data.stats || {});
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const handleSave = async () => {
    if (!form.clientName || !form.amount || !form.dueDate) { toast('Preencha campos obrigatórios', 'error'); return; }
    await fetch('/api/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount), installments: parseInt(form.installments) }),
    });
    toast('Pagamento registrado!', 'success');
    setShowModal(false);
    setForm({ clientName: '', description: '', amount: '', method: 'pix', dueDate: '', installments: '1', unit: 'Barueri', notes: '' });
    fetchPayments();
  };

  const markAsPaid = async (id: string) => {
    await fetch('/api/payments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'pago' }) });
    toast('Pagamento confirmado!', 'success');
    fetchPayments();
  };

  const cancelPayment = async (id: string) => {
    if (!confirm('Cancelar este pagamento?')) return;
    await fetch('/api/payments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'cancelado' }) });
    fetchPayments();
  };

  return (
    <AuthGuard>
      <AppHeader activePage="financeiro" />
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>💳 Controle de Pagamentos</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gerencie recebimentos, parcelas e inadimplência</p>
          </div>
          <button data-tour="pag-novo" onClick={() => setShowModal(true)} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span> Novo Pagamento
          </button>
        </div>

        {/* KPIs */}
        <div data-tour="pag-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'payments', color: '#10b981', label: 'Total Recebido', value: fmt(stats.totalReceived) },
            { icon: 'pending', color: '#f59e0b', label: 'Pendente', value: fmt(stats.totalPending) },
            { icon: 'warning', color: '#ef4444', label: 'Atrasado', value: fmt(stats.totalOverdue) },
            { icon: 'receipt_long', color: '#6366f1', label: 'Registros', value: String(stats.count) },
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
        <div data-tour="pag-filtros" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['', 'pendente', 'pago', 'atrasado', 'cancelado'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '8px 16px', borderRadius: 10, border: statusFilter === s ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: statusFilter === s ? 'var(--primary)' : 'var(--card-bg)', color: statusFilter === s ? '#fff' : 'var(--text-main)',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
            }}>{s ? (STATUS_COLORS[s]?.label || s) : 'Todos'}</button>
          ))}
        </div>

        {/* Payment list */}
        <div data-tour="pag-lista" style={cardS}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3 }}>account_balance_wallet</span>
              <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>Nenhum pagamento registrado</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payments.map(p => {
                const method = METHODS[p.method] || METHODS.pix;
                const statusC = STATUS_COLORS[p.status] || STATUS_COLORS.pendente;
                const due = new Date(p.dueDate);
                const isOverdue = p.status === 'atrasado';
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, border: isOverdue ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--border)', background: isOverdue ? 'rgba(239,68,68,0.02)' : 'var(--card-bg)', transition: 'all 0.15s' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${method.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>{method.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.clientName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.description} • {method.label} • {p.unit}</div>
                    </div>
                    {p.installments > 1 && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>{p.currentInstall}/{p.installments}x</span>
                    )}
                    <div style={{ textAlign: 'right', minWidth: 100 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)' }}>{fmt(p.amount)}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Venc. {due.toLocaleDateString('pt-BR')}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: statusC.bg, color: statusC.color }}>{statusC.label}</span>
                    {p.status === 'pendente' || p.status === 'atrasado' ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => markAsPaid(p.id)} title="Confirmar pagamento" style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.1)', color: '#10b981', cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'inherit' }}>✓ Pago</button>
                        <button onClick={() => cancelPayment(p.id)} title="Cancelar" style={{ padding: '6px 8px', borderRadius: 8, border: 'none', background: 'rgba(148,163,184,0.08)', color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* New Payment Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 500, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>add_card</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Novo Pagamento</h2>
              <button onClick={() => setShowModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelS}>Cliente *</label>
                <input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} placeholder="Nome do cliente" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelS}>Descrição *</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputS} placeholder="Ex: Pacote Depilação Laser" />
              </div>
              <div>
                <label style={labelS}>Valor Total *</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={inputS} placeholder="R$ 0,00" />
              </div>
              <div>
                <label style={labelS}>Parcelas</label>
                <select value={form.installments} onChange={e => setForm({ ...form, installments: e.target.value })} style={selectS}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}x{n > 1 ? ` (${fmt(parseFloat(form.amount || '0') / n)}/mês)` : ' à vista'}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Forma de Pagamento</label>
                <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} style={selectS}>
                  {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Vencimento *</label>
                <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Unidade</label>
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={selectS}>
                  {['Barueri', 'Osasco', 'SBC', 'SCS'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Observações</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputS} placeholder="Notas..." />
              </div>
            </div>
            {parseInt(form.installments) > 1 && form.amount && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>info</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6366f1' }}>
                  {form.installments}x de {fmt(parseFloat(form.amount) / parseInt(form.installments))} — vencimentos mensais a partir de {form.dueDate}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} disabled={!form.clientName || !form.amount || !form.dueDate} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !form.clientName || !form.amount || !form.dueDate ? 0.5 : 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>save</span> Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
