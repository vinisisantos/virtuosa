/**
 * Folha de Pagamento Inteligente — Motor de Cálculo
 * CLT: salário + insalubridade + RT + FGTS + INSS patronal + provisões + benefícios
 * PJ:  valor contratado + VR
 */

export interface PayrollSettings {
  salarioMinimo: number;
  valorRT: number;
  percentualVT: number;       // 0.06 = 6%
  percentualFGTS: number;     // 0.08 = 8%
  percentualINSSPatronal: number; // 0.20 = 20%
  rtEntraNoFGTS: boolean;
  faixasINSS: { limite: number; aliquota: number }[];
}

export const DEFAULT_SETTINGS: PayrollSettings = {
  salarioMinimo: 1621,
  valorRT: 300,
  percentualVT: 0.06,
  percentualFGTS: 0.08,
  percentualINSSPatronal: 0.20,
  rtEntraNoFGTS: false,
  faixasINSS: [
    { limite: 1621.00, aliquota: 0.075 },
    { limite: 3240.00, aliquota: 0.09 },
    { limite: 6400.00, aliquota: 0.12 },
  ],
};

export interface SmartEmployee {
  id: string;
  nome: string;
  unidade: string;
  cargo: string;
  tipo: 'CLT' | 'PJ';
  salarioBase: number;
  insalubridade: boolean;
  rt: boolean;
  vr: number;
  status: 'ativo' | 'inativo';
  createdAt?: string;
}

export interface INSSFaixaDetail {
  faixa: number;
  base: number;
  aliquota: number;
  valor: number;
}

export interface PayrollCalcResult {
  // Inputs
  salarioBase: number;
  tipo: 'CLT' | 'PJ';

  // CLT adicionais
  insalubridadeValor: number;
  rtValor: number;
  baseINSS: number;

  // INSS colaborador (desconto — não é custo da empresa)
  inssDetalhes: INSSFaixaDetail[];
  inssTotal: number;
  inssAliquotaEfetiva: number;

  // Encargos (custo empresa)
  fgts: number;
  inssPatronal: number;

  // Provisões
  provisao13: number;
  provisaoFerias: number;

  // Benefícios
  vr: number;
  vt: number;

  // Total
  custoTotal: number;

  // Breakdown %
  breakdown: { label: string; valor: number; percent: number }[];
}

export type Scenario = 'padrao' | 'sem-provisoes' | 'cenario-pj';

export function calcularFolha(emp: SmartEmployee, settings: PayrollSettings): PayrollCalcResult {
  if (emp.tipo === 'PJ') return calcularPJ(emp, settings);
  return calcularCLT(emp, settings);
}

export function calcularCenario(emp: SmartEmployee, settings: PayrollSettings, scenario: Scenario): PayrollCalcResult {
  if (scenario === 'padrao') return calcularFolha(emp, settings);
  if (scenario === 'cenario-pj') return calcularPJ(emp, settings);
  // sem-provisoes: CLT without 13º and férias
  if (emp.tipo === 'PJ') return calcularPJ(emp, settings);
  const result = calcularCLT(emp, settings);
  const custoSemProvisoes = result.custoTotal - result.provisao13 - result.provisaoFerias;
  return {
    ...result,
    provisao13: 0,
    provisaoFerias: 0,
    custoTotal: custoSemProvisoes,
    breakdown: result.breakdown
      .filter(b => b.label !== 'Provisão 13º' && b.label !== 'Provisão Férias')
      .map(b => ({ ...b, percent: custoSemProvisoes > 0 ? (b.valor / custoSemProvisoes) * 100 : 0 })),
  };
}

function calcularPJ(emp: SmartEmployee, _settings: PayrollSettings): PayrollCalcResult {
  const custoTotal = emp.salarioBase + emp.vr;
  const breakdown: { label: string; valor: number; percent: number }[] = [];
  if (emp.salarioBase > 0) breakdown.push({ label: 'Valor Contratado', valor: emp.salarioBase, percent: custoTotal > 0 ? (emp.salarioBase / custoTotal) * 100 : 0 });
  if (emp.vr > 0) breakdown.push({ label: 'VR', valor: emp.vr, percent: custoTotal > 0 ? (emp.vr / custoTotal) * 100 : 0 });

  return {
    salarioBase: emp.salarioBase, tipo: 'PJ',
    insalubridadeValor: 0, rtValor: 0, baseINSS: 0,
    inssDetalhes: [], inssTotal: 0, inssAliquotaEfetiva: 0,
    fgts: 0, inssPatronal: 0,
    provisao13: 0, provisaoFerias: 0,
    vr: emp.vr, vt: 0,
    custoTotal, breakdown,
  };
}

function calcularCLT(emp: SmartEmployee, s: PayrollSettings): PayrollCalcResult {
  // Adicionais
  const insalubridadeValor = emp.insalubridade ? s.salarioMinimo * 0.20 : 0;
  const rtValor = emp.rt ? s.valorRT : 0;

  // Base INSS
  const baseINSS = emp.salarioBase + insalubridadeValor + rtValor;

  // INSS progressivo (desconto do colaborador)
  const inssDetalhes = calcularINSSProgressivo(baseINSS, s.faixasINSS);
  const inssTotal = inssDetalhes.reduce((sum, f) => sum + f.valor, 0);
  const inssAliquotaEfetiva = baseINSS > 0 ? (inssTotal / baseINSS) * 100 : 0;

  // VT
  const vt = emp.salarioBase * s.percentualVT;

  // FGTS
  const baseFGTS = emp.salarioBase + insalubridadeValor + (s.rtEntraNoFGTS ? rtValor : 0);
  const fgts = baseFGTS * s.percentualFGTS;

  // INSS Patronal
  const inssPatronal = baseINSS * s.percentualINSSPatronal;

  // Provisões
  const provisao13 = baseINSS / 12;
  const provisaoFerias = (baseINSS / 12) * (4 / 3); // 1/12 + 1/3

  // Custo total (INSS do colaborador NÃO entra)
  const custoTotal = emp.salarioBase + insalubridadeValor + rtValor + fgts + inssPatronal + provisao13 + provisaoFerias + emp.vr + vt;

  // Breakdown
  const items = [
    { label: 'Salário Base', valor: emp.salarioBase },
    { label: 'Insalubridade', valor: insalubridadeValor },
    { label: 'RT', valor: rtValor },
    { label: 'FGTS', valor: fgts },
    { label: 'INSS Patronal', valor: inssPatronal },
    { label: 'Provisão 13º', valor: provisao13 },
    { label: 'Provisão Férias', valor: provisaoFerias },
    { label: 'VR', valor: emp.vr },
    { label: 'VT', valor: vt },
  ].filter(i => i.valor > 0);

  const breakdown = items.map(i => ({ ...i, percent: custoTotal > 0 ? (i.valor / custoTotal) * 100 : 0 }));

  return {
    salarioBase: emp.salarioBase, tipo: 'CLT',
    insalubridadeValor, rtValor, baseINSS,
    inssDetalhes, inssTotal, inssAliquotaEfetiva,
    fgts, inssPatronal,
    provisao13, provisaoFerias,
    vr: emp.vr, vt,
    custoTotal, breakdown,
  };
}

function calcularINSSProgressivo(base: number, faixas: { limite: number; aliquota: number }[]): INSSFaixaDetail[] {
  const result: INSSFaixaDetail[] = [];
  let remaining = base;
  let prevLimite = 0;

  for (let i = 0; i < faixas.length && remaining > 0; i++) {
    const faixaSize = faixas[i].limite - prevLimite;
    const baseNaFaixa = Math.min(remaining, faixaSize);
    result.push({
      faixa: i + 1,
      base: baseNaFaixa,
      aliquota: faixas[i].aliquota,
      valor: baseNaFaixa * faixas[i].aliquota,
    });
    remaining -= baseNaFaixa;
    prevLimite = faixas[i].limite;
  }

  // If remaining and exceeded all faixas, apply last faixa rate
  if (remaining > 0 && faixas.length > 0) {
    const lastAliquota = faixas[faixas.length - 1].aliquota;
    result.push({
      faixa: faixas.length + 1,
      base: remaining,
      aliquota: lastAliquota,
      valor: remaining * lastAliquota,
    });
  }

  return result;
}

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPercent(v: number): string {
  return v.toFixed(1) + '%';
}
