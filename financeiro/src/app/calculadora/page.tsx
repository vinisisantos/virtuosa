'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { CalcState, defaultState, calc, fmt } from './useCalc';
import { Etapa1, Etapa2, Etapa3, Etapa4 } from './Etapas';
import { DonutChart } from './DonutChart';
import { generatePDF } from './pdfGenerator';

const cardS: React.CSSProperties = { background:'var(--card-bg)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-md)',padding:24 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Protocol { id: string; name: string; createdAt: string; updatedAt: string; precoSugerido: number; unit: string; [key: string]: any }

interface SavedSimulation { id: string; name: string; savedAt: string; state: CalcState; precoSugerido: number; }

const SIM_STORAGE_KEY = 'virtuosa_calc_simulations';

export default function CalculadoraPage() {
  const [tab, setTab] = useState<'calc'|'list'|'simulations'>('calc');
  const [s, setS] = useState<CalcState>({ ...defaultState });
  const [editId, setEditId] = useState<string|null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSims, setSavedSims] = useState<SavedSimulation[]>([]);

  const set = (u: Partial<CalcState>) => setS(prev => ({ ...prev, ...u }));
  const r = calc(s);

  const fetchProtocols = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pricing');
      const data = await res.json();
      setProtocols(data.protocols || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProtocols(); }, [fetchProtocols]);

  // Load saved simulations from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIM_STORAGE_KEY);
      if (stored) setSavedSims(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveSimulation = () => {
    const name = s.nome.trim() || `Simulação ${new Date().toLocaleDateString('pt-BR')}`;
    const sim: SavedSimulation = {
      id: Date.now().toString(),
      name,
      savedAt: new Date().toISOString(),
      state: { ...s },
      precoSugerido: r.preco,
    };
    const updated = [sim, ...savedSims].slice(0, 50); // keep max 50
    setSavedSims(updated);
    localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(updated));
    toast('Simulação salva localmente!', 'success');
  };

  const loadSimulation = (sim: SavedSimulation) => {
    setS({ ...sim.state });
    setEditId(null);
    setTab('calc');
    toast(`Simulação "${sim.name}" carregada`, 'success');
  };

  const deleteSimulation = async (id: string) => {
    if (!await confirmDialog({ title: 'Excluir Simulação', message: 'Deseja excluir esta simulação salva?', confirmText: 'Excluir', variant: 'danger' })) return;
    const updated = savedSims.filter(s => s.id !== id);
    setSavedSims(updated);
    localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(updated));
    toast('Simulação excluída', 'success');
  };

  const handleDownloadPDF = () => {
    generatePDF(s);
  };

  const handleSave = async () => {
    if (!s.nome.trim()) { toast('Informe o nome do protocolo', 'error'); return; }
    setSaving(true);
    try {
      const { nome, ...rest } = s;
      const body = {
        ...rest, name: nome, precoSugerido: r.preco, unit: 'Todas',
        insumos: s.insumos,
      };
      if (editId) {
        await fetch('/api/pricing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...body }) });
        toast('Protocolo atualizado!', 'success');
      } else {
        await fetch('/api/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        toast('Protocolo salvo!', 'success');
      }
      fetchProtocols();
    } catch { toast('Erro ao salvar', 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Excluir Protocolo', message: 'Deseja excluir este protocolo?', confirmText: 'Excluir', variant: 'danger' })) return;
    await fetch(`/api/pricing?id=${id}`, { method: 'DELETE' });
    toast('Protocolo excluído', 'success');
    fetchProtocols();
  };

  const loadProtocol = (p: Protocol) => {
    setEditId(p.id);
    const ins = Array.isArray(p.insumos) ? p.insumos as any[] : [];
    setS({
      aluguel: p.aluguel, energiaEletrica: p.energiaEletrica, aguaInternet: p.aguaInternet,
      contador: p.contador, salarios: p.salarios, proLabore: p.proLabore,
      materiaisGerais: p.materiaisGerais, marketingTrafego: p.marketingTrafego, comissoes: p.comissoes,
      taxasPlataformas: p.taxasPlataformas, outros: p.outros,
      diasTrabalhados: p.diasTrabalhados, horasDia: p.horasDia, minutosDia: p.minutosDia, qtdSalas: p.qtdSalas,
      impostos: p.impostos, taxaCartao: p.taxaCartao, descontoPaciente: p.descontoPaciente,
      lucroClinica: p.lucroClinica, lucroParceiro: p.lucroParceiro,
      nome: p.name, duracaoHoras: p.duracaoHoras, duracaoMinutos: p.duracaoMinutos,
      locacaoAparelho: p.locacaoAparelho, insumos: ins.length > 0 ? ins : defaultState.insumos,
    });
    setTab('calc');
  };

  const newProtocol = () => { setEditId(null); setS({ ...defaultState }); setTab('calc'); };

  // KPI cards data
  const kpis = [
    { icon: 'schedule', color: '#ec4899', label: 'HORA MACA', value: fmt(r.horaMaca) },
    { icon: 'payments', color: '#6366f1', label: 'CUSTOS MENSAIS', value: fmt(r.custosMensais) },
    { icon: 'inventory_2', color: '#10b981', label: 'TOTAL INSUMOS', value: fmt(r.totalInsumos) },
    { icon: 'percent', color: '#f59e0b', label: 'MARGEM LUCRO', value: `${s.lucroClinica.toFixed(1)}%` },
  ];

  const donutSlices = [
    { label: 'Custos Fixos', value: r.fixos, color: '#ec4899' },
    { label: 'Custos Variáveis', value: r.variaveis, color: '#8b5cf6' },
    { label: 'Insumos', value: r.totalInsumos, color: '#10b981' },
    { label: 'Impostos/Taxas', value: r.impostosVal, color: '#f59e0b' },
  ];

  return (
    <AuthGuard>
      <AppHeader activePage="calculadora" />
      <main style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#ec4899,#be185d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>calculate</span>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900 }}>Calculadora de Procedimentos Estéticos</h1>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Precificação Inteligente</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setTab('calc')} style={{ padding: '10px 20px', borderRadius: 12, border: tab === 'calc' ? 'none' : '1px solid var(--border)', background: tab === 'calc' ? 'linear-gradient(135deg,#ec4899,#be185d)' : 'var(--card-bg)', color: tab === 'calc' ? '#fff' : 'var(--text-main)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calculate</span> Calculadora
            </button>
            <button onClick={() => { setTab('list'); fetchProtocols(); }} style={{ padding: '10px 20px', borderRadius: 12, border: tab === 'list' ? 'none' : '1px solid var(--border)', background: tab === 'list' ? 'linear-gradient(135deg,#ec4899,#be185d)' : 'var(--card-bg)', color: tab === 'list' ? '#fff' : 'var(--text-main)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>list_alt</span> Procedimentos
            </button>
            <button onClick={() => setTab('simulations')} style={{ padding: '10px 20px', borderRadius: 12, border: tab === 'simulations' ? 'none' : '1px solid var(--border)', background: tab === 'simulations' ? 'linear-gradient(135deg,#ec4899,#be185d)' : 'var(--card-bg)', color: tab === 'simulations' ? '#fff' : 'var(--text-main)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>bookmark</span> Simulações ({savedSims.length})
            </button>
          </div>
        </div>

        {tab === 'calc' ? (
          <>
            {/* KPI summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
              {kpis.map(k => (
                <div key={k.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${k.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: k.color }}>{k.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k.label}</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>{k.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Preço Sugerido + Donut */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              <div style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', borderRadius: 20, padding: 28, border: '1px solid rgba(236,72,153,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ec4899' }}>auto_awesome</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#ec4899', textTransform: 'uppercase', letterSpacing: 1 }}>Preço Sugerido</span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#9d174d', marginBottom: 4 }}>{s.nome || 'Procedimento'}</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#be185d', marginBottom: 16 }}>{fmt(r.preco)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#9d174d', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_up</span> Lucro da Clínica:
                    </span>
                    <span style={{ fontWeight: 900, color: '#be185d' }}>{fmt(r.lucroClinicaVal)}</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#9d174d', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_up</span> Lucro do Profissional Parceiro:
                    </span>
                    <span style={{ fontWeight: 900, color: '#be185d' }}>{fmt(r.lucroParceiroVal)}</span>
                  </div>
                </div>
              </div>
              <div style={cardS}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Composição de Custos</div>
                <DonutChart slices={donutSlices} />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
              <button onClick={saveSimulation} style={{ padding: '12px 22px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8b5cf6' }}>bookmark_add</span> Salvar Simulação
              </button>
              <button onClick={handleDownloadPDF} style={{ padding: '12px 22px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444' }}>picture_as_pdf</span> Baixar PDF
              </button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '12px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#ec4899,#be185d)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.6 : 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>save</span> {saving ? 'Salvando...' : editId ? 'Atualizar Protocolo' : 'Salvar Protocolo'}
              </button>
            </div>

            {/* 4 Steps */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Etapa1 s={s} set={set} />
                <Etapa2 s={s} set={set} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Etapa3 s={s} set={set} />
                <Etapa4 s={s} set={set} />
              </div>
            </div>

            {/* Floating price bar */}
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#ec4899,#be185d)', borderRadius: 16, padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 8px 32px rgba(236,72,153,0.35)', zIndex: 50 }}>
              <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>Preço Sugerido</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>auto_awesome</span> {fmt(r.preco)}
                </div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.3)' }} />
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Clínica</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#fff' }}>{fmt(r.lucroClinicaVal)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Parceiro</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#fff' }}>{fmt(r.lucroParceiroVal)}</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.3)' }} />
              <button onClick={saveSimulation} title="Salvar Simulação" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.75rem', transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>bookmark_add</span>
              </button>
              <button onClick={handleDownloadPDF} title="Baixar PDF" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.75rem', transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span>
              </button>
            </div>
          </>
        ) : tab === 'list' ? (
          /* Protocols List */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Protocolos Salvos ({protocols.length})</h2>
              <button onClick={newProtocol} style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ec4899,#be185d)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Novo
              </button>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Carregando...</div>
            ) : protocols.length === 0 ? (
              <div style={{ ...cardS, textAlign: 'center', padding: 60 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3 }}>calculate</span>
                <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Nenhum protocolo salvo</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {protocols.map(p => {
                  const pc = calc({ ...defaultState, ...p, nome: p.name, insumos: Array.isArray(p.insumos) ? p.insumos as any : defaultState.insumos });
                  return (
                    <div key={p.id} style={{ ...cardS, cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} onClick={() => loadProtocol(p)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: '1rem', fontWeight: 800 }}>{p.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); handleDelete(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                      <div style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ec4899' }}>Preço Sugerido</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#be185d' }}>{fmt(pc.preco)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hora Maca: <strong>{fmt(pc.horaMaca)}</strong></div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Insumos: <strong>{fmt(pc.totalInsumos)}</strong></div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Lucro Clínica: <strong>{fmt(pc.lucroClinicaVal)}</strong></div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Margem: <strong>{p.lucroClinica}%</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : tab === 'simulations' ? (
          /* Saved Simulations */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Simulações Salvas ({savedSims.length})</h2>
              <button onClick={newProtocol} style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ec4899,#be185d)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Nova Simulação
              </button>
            </div>
            {savedSims.length === 0 ? (
              <div style={{ ...cardS, textAlign: 'center', padding: 60 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3 }}>bookmark</span>
                <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Nenhuma simulação salva</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 4 }}>Use o botão &quot;Salvar Simulação&quot; na calculadora para guardar rapidamente</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {savedSims.map(sim => {
                  const simR = calc(sim.state);
                  return (
                    <div key={sim.id} style={{ ...cardS, cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} onClick={() => loadSimulation(sim)}>
                      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); setS({ ...sim.state }); handleDownloadPDF(); }} title="Baixar PDF" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>picture_as_pdf</span>
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteSimulation(sim.id); }} title="Excluir" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8b5cf6' }}>bookmark</span>
                        </div>
                        <div>
                          <div style={{ fontSize: '1rem', fontWeight: 800 }}>{sim.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                            {new Date(sim.savedAt).toLocaleDateString('pt-BR')} às {new Date(sim.savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ec4899' }}>Preço Sugerido</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#be185d' }}>{fmt(simR.preco)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hora Maca: <strong>{fmt(simR.horaMaca)}</strong></div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Insumos: <strong>{fmt(simR.totalInsumos)}</strong></div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Lucro Clínica: <strong>{fmt(simR.lucroClinicaVal)}</strong></div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Margem: <strong>{sim.state.lucroClinica}%</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </main>
    </AuthGuard>
  );
}
