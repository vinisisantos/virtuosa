'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { CalcState, defaultState, defaultPricing, calc, fmt, deserializeProtocol, serializeProtocol, validateState } from './useCalc';
import { Etapa1, Etapa2, Etapa3, Etapa4 } from './Etapas';
import { FieldHelp } from './FieldHelp';
import { DonutChart } from './DonutChart';
import { generatePDF } from './pdfGenerator';
import { normalizeInstallmentRates } from '@/lib/payment-fees';
import './calculator.css';
import './page.css';

interface Protocol { id: string; name: string; unit: string; updatedAt: string; precoSugerido: number; insumos: unknown }
interface SavedSimulation { id: string; name: string; savedAt: string; state: CalcState; precoSugerido: number }
interface FeeConfig { id: string; name: string; method: string; brand: string | null; unit: string; fixedFee: number; fixedRate: number; installmentRates: Record<string, number> }
const LEGACY_STORAGE_KEY = 'virtuosa_calc_simulations';
const message = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir a operação.';
const month = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fresh = (unit: string): CalcState => ({ ...defaultState, insumos: defaultState.insumos.map(i => ({ ...i })), pricing: { ...defaultPricing, unit, referenceMonth: month() } });

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Falha na comunicação com o servidor.');
  return data;
}

export default function CalculadoraPage() {
  return <AuthGuard><Calculator /></AuthGuard>;
}

function Calculator() {
  const { globalUnit, units } = useGlobalUnit();
  const [tab, setTab] = useState<'calc' | 'list' | 'simulations'>('calc');
  const [s, setS] = useState<CalcState>(() => fresh(globalUnit));
  const [edit, setEdit] = useState<Protocol | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [savedSims, setSavedSims] = useState<SavedSimulation[]>([]);
  const [legacySims, setLegacySims] = useState<SavedSimulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<FeeConfig[]>([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feeSelection, setFeeSelection] = useState('');
  const requestId = useRef(0);
  const feeRequestId = useRef(0);
  const storageKey = useRef('');
  const cleanState = useRef(JSON.stringify(s));
  const set = (u: Partial<CalcState>) => setS(prev => ({ ...prev, ...u }));
  const r = calc(s);

  const fetchProtocols = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setLoadError('');
    try {
      const data = await jsonRequest(`/api/pricing?unit=${encodeURIComponent(globalUnit || 'Todas')}`);
      if (id === requestId.current) setProtocols(data.protocols || []);
    } catch (e) { if (id === requestId.current) { setProtocols([]); setLoadError(message(e)); } }
    finally { if (id === requestId.current) setLoading(false); }
  }, [globalUnit]);
  useEffect(() => { void fetchProtocols(); }, [fetchProtocols]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('virtuosa_user') || '{}');
      if (!user.id && !user.userId) return;
      storageKey.current = `${LEGACY_STORAGE_KEY}:${user.id || user.userId}`;
      const current = JSON.parse(localStorage.getItem(storageKey.current) || '[]');
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
      if (Array.isArray(current)) setSavedSims(current);
      if (Array.isArray(legacy)) setLegacySims(legacy);
    } catch { toast('Não foi possível ler as simulações deste navegador. Os dados não foram apagados.', 'error'); }
  }, []);

  useEffect(() => { feeRequestId.current++; setConfigs([]); setFeeSelection(''); setFeesLoading(false); }, [s.pricing?.unit]);

  const saveSimulation = () => {
    if (!r.valid) { toast('Revise os campos antes de salvar.', 'error'); return; }
    try {
      if (!storageKey.current) throw new Error('Sessão não identificada. Recarregue a página.');
      const sim = { id: crypto.randomUUID(), name: s.nome.trim() || 'Simulação', savedAt: new Date().toISOString(), state: s, precoSugerido: r.preco };
      const updated = [sim, ...savedSims];
      localStorage.setItem(storageKey.current, JSON.stringify(updated));
      setSavedSims(updated); toast('Simulação salva neste navegador.', 'success');
    } catch (e) { toast(message(e), 'error'); }
  };
  const mayReplace = async () => JSON.stringify(s) === cleanState.current || await confirmDialog({ title: 'Alterações não salvas', message: 'Há alterações neste cálculo. Deseja descartá-las e abrir outro? Para preservar tudo, cancele e salve antes.', confirmText: 'Descartar e continuar', variant: 'danger' });
  const loadSimulation = async (sim: SavedSimulation) => {
    try {
      if (!await mayReplace()) return;
      const errors = validateState(sim.state);
      if (errors.length) throw new Error(errors.join(' '));
      cleanState.current = JSON.stringify(sim.state);
      setS(structuredClone(sim.state)); setEdit(null); setTab('calc');
    } catch (e) { toast(`Não foi possível abrir esta simulação: ${message(e)}`, 'error'); }
  };
  const deleteSimulation = async (id: string, legacy: boolean) => {
    if (!await confirmDialog({ title: 'Excluir simulação', message: 'Excluir somente esta simulação deste navegador?', confirmText: 'Excluir', variant: 'danger' })) return;
    try {
      const updated = (legacy ? legacySims : savedSims).filter(x => x.id !== id);
      localStorage.setItem(legacy ? LEGACY_STORAGE_KEY : storageKey.current, JSON.stringify(updated));
      (legacy ? setLegacySims : setSavedSims)(updated);
    } catch (e) { toast(message(e), 'error'); }
  };
  const newProtocol = async () => {
    if (!await mayReplace()) return;
    const next = fresh(globalUnit); cleanState.current = JSON.stringify(next);
    setS(next); setEdit(null); setTab('calc');
  };
  const loadProtocol = async (p: Protocol) => {
    try { if (!await mayReplace()) return; const next = deserializeProtocol(p); cleanState.current = JSON.stringify(next); setS(next); setEdit(p); setTab('calc'); }
    catch (e) { toast(message(e), 'error'); }
  };
  const handleSave = async (copy = false) => {
    try {
      const body = serializeProtocol(s);
      setSaving(true);
      const data = await jsonRequest('/api/pricing', {
        method: edit && !copy ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, unit: s.pricing?.unit || edit?.unit || globalUnit || 'Todas', ...(edit && !copy ? { id: edit.id } : {}) }),
      });
      cleanState.current = JSON.stringify(s);
      setEdit(data); toast(copy ? 'Cópia salva. O original foi preservado.' : 'Protocolo salvo.', 'success');
      void fetchProtocols();
    } catch (e) { toast(message(e), 'error'); }
    finally { setSaving(false); }
  };
  const handleDelete = async (p: Protocol) => {
    if (!await confirmDialog({ title: 'Excluir protocolo', message: `Excluir “${p.name}”? As vendas e o catálogo não serão alterados.`, confirmText: 'Excluir', variant: 'danger' })) return;
    try { await jsonRequest(`/api/pricing?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' }); if (edit?.id === p.id) setEdit(null); void fetchProtocols(); }
    catch (e) { toast(message(e), 'error'); }
  };
  const convertLegacy = async () => {
    if (!await confirmDialog({ title: 'Comparar no novo modelo', message: 'Será aberta uma cópia. Informe ocupação, margem e remuneração do profissional; os percentuais antigos não serão convertidos automaticamente.', confirmText: 'Criar cópia' })) return;
    setS(prev => ({ ...prev, nome: `${prev.nome} — novo modelo`.trim(), pricing: { ...defaultPricing, unit: globalUnit, referenceMonth: month() } }));
    setEdit(null);
  };
  const loadFees = async () => {
    if (!s.pricing?.unit) { toast('Escolha a unidade do cálculo.', 'error'); return; }
    const id = ++feeRequestId.current;
    setFeesLoading(true);
    try {
      const data = await jsonRequest(`/api/payment-fee-configs?unit=${encodeURIComponent(s.pricing.unit)}`);
      if (id === feeRequestId.current) { setConfigs(data.configurations || []); if (!data.configurations?.length) toast('Não há taxas cadastradas nesta unidade. Preencha manualmente.', 'info'); }
    } catch (e) { if (id === feeRequestId.current) toast(message(e), 'error'); }
    finally { if (id === feeRequestId.current) setFeesLoading(false); }
  };
  const applyFee = (value: string) => {
    setFeeSelection(value);
    if (!value || !s.pricing) return;
    const [id, count] = value.split(':');
    const config = configs.find(c => c.id === id);
    if (!config || config.unit !== s.pricing.unit) return;
    const installments = Number(count);
    const rate = normalizeInstallmentRates(config.installmentRates)[String(installments)] ?? 0;
    set({ taxaCartao: config.fixedRate + rate, pricing: { ...s.pricing, paymentFixed: config.fixedFee, installments, paymentLabel: `${config.name}${config.brand ? ` / ${config.brand}` : ''} · ${installments}x` } });
    toast('Taxas copiadas para o cenário. Você pode ajustá-las sem mudar o cadastro da operadora.', 'success');
  };

  const price = (value: number) => r.valid ? fmt(value) : '—';
  const outgoingPercent = s.pricing ? (s.impostos + s.taxaCartao + s.pricing.professionalPercent + s.pricing.salesCommission) / 100 : 0;
  const slices = s.pricing ? [
    { label: 'Estrutura atribuída', value: r.custoHoraProcedimento, color: '#db2777' },
    { label: 'Custos diretos', value: r.custoDireto, color: '#059669' },
    { label: 'Taxas e comissões', value: r.precoCobrado * outgoingPercent + s.pricing.paymentFixed, color: '#d97706' },
    { label: 'Resultado estimado', value: Math.max(0, r.lucroEfetivo), color: '#6366f1' },
  ] : [
    { label: 'Estrutura atribuída', value: r.custoHoraProcedimento, color: '#db2777' },
    { label: 'Insumos e locação', value: r.totalInsumos, color: '#059669' },
    { label: 'Deduções legadas', value: r.impostosVal, color: '#d97706' },
    { label: 'Acréscimos legados', value: r.lucroClinicaVal + r.lucroParceiroVal, color: '#6366f1' },
  ];

  return <><AppHeader activePage="calculadora" /><main className="pricing-page">
    <header className="pricing-header"><div><p className="pricing-eyebrow">GESTÃO DE PREÇOS</p><h1>Calculadora de procedimentos</h1><p>Entenda os custos antes de definir o preço final.</p></div><button className="pricing-button" onClick={() => void newProtocol()}>Novo cálculo</button></header>
    <nav className="pricing-tabs" aria-label="Áreas da calculadora">{(['calc', 'list', 'simulations'] as const).map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t === 'calc' ? 'Calculadora' : t === 'list' ? 'Procedimentos salvos' : `Simulações (${savedSims.length + legacySims.length})`}</button>)}</nav>
    {tab === 'calc' ? <>
      {!s.pricing ? <aside className="pricing-notice"><strong>Modelo legado preservado</strong><p>Os percentuais de lucro são acréscimos sobre o custo, não margem sobre a venda. O resultado mantém a fórmula original.</p><button className="pricing-button" onClick={() => void convertLegacy()}>Comparar uma cópia no novo modelo</button></aside> : <section className="pricing-context">
        <div><label htmlFor="pricing-unit">Unidade do cálculo</label><FieldHelp label="Unidade do cálculo" help="Custos e ocupação devem representar uma única unidade. Trocar a unidade não importa custos automaticamente. Para um protocolo já salvo, use Salvar cópia para criar em outra unidade." /><select id="pricing-unit" value={s.pricing.unit} onChange={e => set({ pricing: { ...s.pricing!, unit: e.target.value } })}><option value="">Selecione uma unidade</option>{units.filter(Boolean).map(u => <option key={u}>{u}</option>)}</select></div>
        <div><strong>Como preencher</strong><p>Use os custos do mês de referência. As interrogações explicam cada campo. Taxas e margens iniciais em zero não significam isenção nem recomendação.</p></div>
      </section>}
      <div className="pricing-kpis">{[
        ['Custo por hora produtiva', price(r.horaMaca)], ['Custo do procedimento', price(r.baseCusto)],
        ['Despesas mensais', fmt(r.custosMensais)], [s.pricing ? 'Margem desejada' : 'Acréscimo sobre custo', `${s.pricing?.targetMargin ?? s.lucroClinica}%`],
      ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {!r.valid && <aside className="pricing-notice" role="status"><strong>Complete ou revise o cenário para calcular</strong><ul>{r.errors.map(e => <li key={e}>{e}</li>)}</ul></aside>}
      <section className="pricing-results">
        <div className="pricing-target"><p>{s.pricing ? 'PREÇO-ALVO · APÓS DESCONTO' : 'PREÇO SUGERIDO · MODELO LEGADO'}</p><h2>{price(r.preco)}</h2><span>{s.nome || 'Seu procedimento'}</span>
          {s.pricing && <dl><div><dt>Piso estimado sem lucro <FieldHelp label="Piso estimado sem lucro" help="Valor que cobre os custos atribuídos e as despesas da venda, sem lucro. Depende do volume e da ocupação planejados; não é garantia de equilíbrio da clínica." /></dt><dd>{price(r.piso)}</dd></div><div><dt>Preço de tabela sugerido <FieldHelp label="Preço de tabela sugerido" help="Preço-alvo dividido por (1 − desconto planejado). Assim, depois do desconto, o valor cobrado preserva a margem desejada." /></dt><dd>{price(r.precoTabela)}</dd></div><div><dt>Alvo à vista sem taxa de pagamento <FieldHelp label="Alvo à vista sem taxa de pagamento" help="Cenário comparativo que zera a taxa percentual e a taxa fixa do pagamento, mantendo impostos, comissões e margem. Pix pode ter tarifas: se houver, informe-as no cenário principal." /></dt><dd>{price(r.precoPix)}</dd></div></dl>}
        </div>
        <div className="pricing-panel"><h2>Composição por procedimento</h2>{r.valid ? <DonutChart slices={slices.filter(x => x.value > 0)} /> : <p>Preencha as premissas para visualizar a composição.</p>}{s.pricing && r.valid && r.lucroEfetivo < 0 && <p className="pricing-danger">Prejuízo estimado: {fmt(-r.lucroEfetivo)}. O gráfico mostra os custos; a diferença excede o valor cobrado.</p>}</div>
      </section>
      {s.pricing && <section className="pricing-panel pricing-outcome"><h2>O que sobra no preço escolhido</h2><p>Preço comercial de {price(r.precoComercial)} antes de {s.descontoPaciente}% de desconto. Se o campo estiver em zero, usamos a tabela sugerida.</p><div className="pricing-kpis"><div><span>Paciente paga</span><strong>{price(r.precoCobrado)}</strong></div><div><span>Resultado estimado</span><strong>{price(r.lucroEfetivo)}</strong></div><div><span>Margem efetiva</span><strong>{r.valid ? `${r.margemEfetiva.toFixed(2)}%` : '—'}</strong></div><div><span>Desconto máximo para margem mínima</span><strong>{r.valid ? `${r.descontoMaximo.toFixed(2)}%` : '—'}</strong></div></div><p>{r.valid && r.parcelas.length > 0 ? `Parcelamento: ${r.parcelas.map((v, i) => `${i + 1}ª ${fmt(v)}`).join(' · ')}` : 'Parcelas disponíveis após calcular.'}</p><p className="pricing-caption">A margem mínima é o limite de negociação, não a margem-alvo. O cálculo não muda catálogo, orçamento ou venda.</p></section>}
      {r.warnings.length > 0 && <aside className="pricing-notice"><strong>Conferências importantes</strong><ul>{r.warnings.map(w => <li key={w}>{w}</li>)}</ul></aside>}
      <div className="pricing-actions"><button className="pricing-button" disabled={!r.valid} onClick={saveSimulation}>Salvar simulação local</button><button className="pricing-button" disabled={!r.valid} onClick={() => { if (!generatePDF(s)) toast('Não foi possível abrir a impressão. Verifique os dados e permita a janela de impressão.', 'error'); }}>Baixar PDF</button>{edit && <button className="pricing-button" disabled={saving || !r.valid} onClick={() => void handleSave(true)}>Salvar cópia</button>}<button className="pricing-button pricing-primary" disabled={saving || !r.valid} onClick={() => void handleSave()}>{saving ? 'Salvando…' : edit ? 'Atualizar protocolo' : 'Salvar protocolo'}</button></div>
      {s.pricing && <section className="pricing-panel"><h2>Taxas por forma de pagamento</h2><p>Informe a taxa efetiva nos campos ou copie uma configuração cadastrada. A taxa sempre entra no preço final calculado; não há repasse adicional automático.</p><button className="pricing-button" disabled={feesLoading} onClick={() => void loadFees()}>{feesLoading ? 'Buscando…' : 'Consultar taxas cadastradas'}</button>{configs.length > 0 && <div className="pricing-fee-select"><label htmlFor="pricing-fee">Operadora e parcelamento</label><FieldHelp label="Operadora e parcelamento" help="Copia a taxa fixa em reais e a soma da taxa percentual com a taxa do parcelamento para este cenário. Alterações futuras da operadora não mudam os protocolos salvos. Você pode editar os campos copiados." /><select id="pricing-fee" value={feeSelection} onChange={e => applyFee(e.target.value)}><option value="">Selecione para copiar as taxas</option>{configs.flatMap(c => { const rates = normalizeInstallmentRates(c.installmentRates); const counts = Object.keys(rates).length ? Object.keys(rates).map(Number).sort((a, b) => a - b) : [1]; return counts.map(n => <option key={`${c.id}:${n}`} value={`${c.id}:${n}`}>{c.name} · {c.method} · {c.brand || 'Todas as bandeiras'} · {n}x · {c.fixedRate + (rates[n] ?? 0)}% + {fmt(c.fixedFee)}</option>); })}</select></div>}<p className="pricing-caption">Referência copiada: {s.pricing.paymentLabel}. Os valores dos campos abaixo são os usados no cálculo.</p></section>}
      <div className="pricing-form-grid"><div><Etapa1 s={s} set={set} /><Etapa2 s={s} set={set} /></div><div><Etapa3 s={s} set={set} /><Etapa4 s={s} set={set} /></div></div>
      <section className="pricing-panel"><h2>Entenda a conta</h2><p>{s.pricing ? 'Preço-alvo = (custo direto + estrutura atribuída + taxa fixa do pagamento) ÷ (1 − impostos − taxas percentuais − comissões − margem desejada).' : 'Modelo legado: custo × (1 + acréscimo da clínica + acréscimo do parceiro) ÷ (1 − impostos − cartão − desconto).'}</p><p>Percentuais sobre a venda usam o valor efetivamente cobrado. Custos e capacidade devem ser revisados; compare a sugestão com sua demanda e posicionamento antes de aprovar o preço.</p></section>
      <div className="pricing-bottom"><span>{s.pricing ? 'Preço-alvo' : 'Preço legado'} <strong>{price(r.preco)}</strong></span><button disabled={saving || !r.valid} onClick={() => void handleSave()}>{saving ? 'Salvando…' : 'Salvar protocolo'}</button></div>
    </> : tab === 'list' ? <section><div className="pricing-header"><h2>Protocolos · {globalUnit || 'Todas as unidades'}</h2><button className="pricing-button" onClick={() => void fetchProtocols()}>Atualizar lista</button></div>{loading ? <p role="status">Carregando protocolos…</p> : loadError ? <p role="alert">{loadError}</p> : protocols.length === 0 ? <p>Nenhum protocolo salvo nesta unidade.</p> : <div className="pricing-saved-grid">{protocols.map(p => <article className="pricing-panel" key={p.id}><p className="pricing-caption">{p.unit} · {Array.isArray(p.insumos) ? 'Modelo legado' : 'Margem sobre venda'}</p><h3>{p.name}</h3><strong className="pricing-saved-price">{fmt(p.precoSugerido)}</strong><p className="pricing-caption">Preço-alvo salvo · {new Date(p.updatedAt).toLocaleDateString('pt-BR')}</p><div className="pricing-actions"><button className="pricing-button" onClick={() => loadProtocol(p)}>Abrir</button><button className="pricing-button" onClick={() => void handleDelete(p)}>Excluir</button></div></article>)}</div>}</section> : <section><h2>Simulações neste navegador</h2><p>As novas simulações ficam separadas por usuário. Registros antigos deste navegador continuam disponíveis abaixo e não foram alterados.</p>{savedSims.length + legacySims.length === 0 && <p>Nenhuma simulação salva.</p>}<div className="pricing-saved-grid">{[...savedSims.map(sim => ({ sim, legacy: false })), ...legacySims.map(sim => ({ sim, legacy: true }))].map(({ sim, legacy }) => <article className="pricing-panel" key={`${legacy}:${sim.id}`}><p className="pricing-caption">{legacy ? 'Legado deste navegador' : sim.state.pricing?.unit || 'Modelo legado'}</p><h3>{sim.name}</h3><strong className="pricing-saved-price">{fmt(sim.precoSugerido)}</strong><p>Salva em {new Date(sim.savedAt).toLocaleDateString('pt-BR')}</p><div className="pricing-actions"><button className="pricing-button" onClick={() => loadSimulation(sim)}>Carregar</button><button className="pricing-button" onClick={() => void deleteSimulation(sim.id, legacy)}>Excluir</button></div></article>)}</div></section>}
  </main></>;
}
