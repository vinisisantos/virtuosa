'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface Contract { id: string; clientName: string; clientCpf: string | null; templateName: string; content: string; status: string; signedAt: string | null; signatureImage?: string | null; unit: string; createdAt: string; }

const STATUS_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  assinado: { label: 'Assinado', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  cancelado: { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
};
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };

export default function ContratosPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Contract | null>(null);
  const [form, setForm] = useState({ clientName: '', clientCpf: '', templateName: '', unit: 'Barueri', procedimento: '', valor: '', pagamento: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/contracts');
    const data = await res.json();
    setContracts(data.contracts || []);
    setTemplates(data.templates || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createContract = async () => {
    if (!form.clientName || !form.templateName) { toast('Preencha campos obrigatórios', 'error'); return; }
    await fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    toast('Contrato gerado!', 'success');
    setShowModal(false);
    fetchData();
  };

  const signContract = async (id: string) => {
    await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'assinado' }) });
    toast('Contrato assinado!', 'success');
    setViewContract(null);
    fetchData();
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const res = await fetch(`/api/contracts?id=${confirmDelete.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Contrato excluído com sucesso!', 'success');
      setViewContract(null);
      fetchData();
    } else {
      toast('Erro ao excluir contrato', 'error');
    }
    setConfirmDelete(null);
  };

  const printContract = (contract: Contract) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>${contract.templateName} — ${contract.clientName}</title><style>body{font-family:Arial,sans-serif;padding:48px;line-height:1.8;max-width:800px;margin:0 auto;} @media print{body{padding:24px;}} img{max-width:280px;}</style></head><body>${contract.content}${contract.signatureImage ? `<div style="margin-top:40px;border-top:1px solid #ccc;padding-top:20px;"><p><strong>Assinatura:</strong></p><img src="${contract.signatureImage}" /><p>${contract.clientName}<br/><small>${contract.signedAt ? new Date(contract.signedAt).toLocaleString('pt-BR') : ''}</small></p></div>` : ''}</body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <AuthGuard>
      <AppHeader activePage="contratos" />
      <main style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>📑 Contratos Digitais</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gere, assine e gerencie contratos e termos</p>
          </div>
          <button onClick={() => { setForm({ clientName: '', clientCpf: '', templateName: templates[0] || '', unit: 'Barueri', procedimento: '', valor: '', pagamento: '' }); setShowModal(true); }} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>note_add</span> Novo Contrato
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'description', color: '#6366f1', label: 'Total', value: contracts.length },
            { icon: 'pending', color: '#f59e0b', label: 'Pendentes', value: contracts.filter(c => c.status === 'pendente').length },
            { icon: 'task_alt', color: '#10b981', label: 'Assinados', value: contracts.filter(c => c.status === 'assinado').length },
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

        {/* Contract list */}
        <div style={cardS}>
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div> : contracts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3, color: 'var(--text-muted)' }}>description</span>
              <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Nenhum contrato gerado</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {contracts.map(c => {
                const st = STATUS_COLORS[c.status] || STATUS_COLORS.pendente;
                return (
                  <div key={c.id} onClick={() => setViewContract(c)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: st.color }}>description</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.templateName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.clientName} • {c.unit} • {new Date(c.createdAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: st.bg, color: st.color }}>{st.label}</span>
                    {c.status === 'pendente' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }}
                        title="Excluir contrato"
                        style={{ background: 'rgba(239,68,68,0.06)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 500, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>note_add</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Gerar Contrato</h2>
              <button onClick={() => setShowModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Template *</label>
                <select value={form.templateName} onChange={e => setForm({ ...form, templateName: e.target.value })} style={inputS}>
                  {templates.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Cliente *</label>
                <input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} placeholder="Nome completo" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>CPF</label>
                <input value={form.clientCpf} onChange={e => setForm({ ...form, clientCpf: e.target.value })} style={inputS} placeholder="000.000.000-00" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Procedimento</label>
                <input value={form.procedimento} onChange={e => setForm({ ...form, procedimento: e.target.value })} style={inputS} placeholder="Ex: Depilação Laser" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Unidade</label>
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputS}>
                  {['Barueri', 'Osasco', 'SBC', 'SCS'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={createContract} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Gerar Contrato</button>
            </div>
          </div>
        </div>
      )}

      {/* View Contract */}
      {viewContract && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setViewContract(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 700, width: '100%', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>description</span>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{viewContract.templateName}</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{viewContract.clientName} • {viewContract.unit}</div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: STATUS_COLORS[viewContract.status]?.bg, color: STATUS_COLORS[viewContract.status]?.color }}>{STATUS_COLORS[viewContract.status]?.label}</span>
              <button onClick={() => setViewContract(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '24px 28px', marginBottom: 20, fontFamily: 'Georgia, serif', fontSize: '0.88rem', lineHeight: 1.8, color: 'var(--text-main)' }} dangerouslySetInnerHTML={{ __html: viewContract.content }} />
            {viewContract.status === 'assinado' && viewContract.signatureImage && (
              <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '20px 28px', marginBottom: 20, borderTop: '2px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Assinatura Digital</div>
                <img src={viewContract.signatureImage} alt="Assinatura" style={{ maxWidth: 280, maxHeight: 120, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: 8 }} />
                <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <strong>{viewContract.clientName}</strong>
                  {viewContract.signedAt && <span> — {new Date(viewContract.signedAt).toLocaleString('pt-BR')}</span>}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => printContract(viewContract)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span> Imprimir
              </button>
              {viewContract.status === 'pendente' && (
                <button onClick={() => signContract(viewContract.id)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>draw</span> Assinar Digitalmente
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Custom Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20, animation: 'fadeIn 0.15s ease-out' }} onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: '32px 28px', maxWidth: 420, width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'fadeInScale 0.2s ease-out', textAlign: 'center' }}>
            {/* Warning Icon */}
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ef4444' }}>delete_forever</span>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>Excluir Contrato?</h3>
            <p style={{ margin: '0 0 6px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5 }}>
              O contrato de <strong style={{ color: 'var(--text-main)' }}>{confirmDelete.clientName}</strong> será excluído permanentemente.
            </p>
            <p style={{ margin: '0 0 24px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', transition: 'all 0.15s' }}>
                Cancelar
              </button>
              <button onClick={executeDelete} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 15px rgba(239,68,68,0.3)', transition: 'all 0.15s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
