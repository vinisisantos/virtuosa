import { splitAmountIntoInstallments } from '@/lib/payment-fees';

export { formatCurrency as fmt } from '@/lib/currency';

export interface Insumo {
  nome: string; valor: number; quantidade?: number; perdaPercentual?: number; unidade?: string;
}

export interface PricingOptions {
  version: 2; unit: string; referenceMonth: string;
  occupancy: number; preparationMinutes: number;
  professionalFixed: number; professionalPercent: number; salesCommission: number;
  targetMargin: number; minMargin: number; finalPrice: number;
  paymentFixed: number; installments: number; paymentLabel: string;
}

export interface CalcState {
  aluguel: number; energiaEletrica: number; aguaInternet: number;
  contador: number; salarios: number; proLabore: number;
  materiaisGerais: number; marketingTrafego: number; comissoes: number;
  taxasPlataformas: number; outros: number;
  diasTrabalhados: number; horasDia: number; minutosDia: number; qtdSalas: number;
  impostos: number; taxaCartao: number; descontoPaciente: number;
  lucroClinica: number; lucroParceiro: number;
  nome: string; duracaoHoras: number; duracaoMinutos: number;
  insumos: Insumo[]; locacaoAparelho: number;
  pricing?: PricingOptions;
}

export const defaultPricing: PricingOptions = {
  version: 2, unit: '', referenceMonth: '', occupancy: 0, preparationMinutes: 0,
  professionalFixed: 0, professionalPercent: 0, salesCommission: 0,
  targetMargin: 0, minMargin: 0, finalPrice: 0, paymentFixed: 0,
  installments: 1, paymentLabel: 'Taxa manual',
};

export const defaultState: CalcState = {
  aluguel: 0, energiaEletrica: 0, aguaInternet: 0, contador: 0, salarios: 0, proLabore: 0,
  materiaisGerais: 0, marketingTrafego: 0, comissoes: 0, taxasPlataformas: 0, outros: 0,
  diasTrabalhados: 26, horasDia: 8, minutosDia: 0, qtdSalas: 1,
  impostos: 0, taxaCartao: 0, descontoPaciente: 0, lucroClinica: 0, lucroParceiro: 0,
  nome: '', duracaoHoras: 1, duracaoMinutos: 0, locacaoAparelho: 0,
  insumos: [{ nome: 'Insumo 1', valor: 0, quantidade: 1, perdaPercentual: 0, unidade: 'un' }],
  pricing: { ...defaultPricing },
};

const monetaryFields = [
  'aluguel', 'energiaEletrica', 'aguaInternet', 'contador', 'salarios', 'proLabore',
  'materiaisGerais', 'marketingTrafego', 'comissoes', 'taxasPlataformas', 'outros', 'locacaoAparelho',
] as const;
const percentFields = ['impostos', 'taxaCartao', 'descontoPaciente', 'lucroClinica', 'lucroParceiro'] as const;
const operationLimits = {
  diasTrabalhados: 31, horasDia: 24, minutosDia: 59, qtdSalas: 1000,
  duracaoHoras: 24, duracaoMinutos: 59,
} as const;
const numericFields = [...monetaryFields, ...percentFields, ...Object.keys(operationLimits) as (keyof typeof operationLimits)[]];
const units = ['Osasco', 'SBC', 'SCS'];
const MAX_MONEY = 1_000_000_000;
const MAX_RESULT = 1_000_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numberError(value: unknown, label: string, max = MAX_MONEY, integer = false): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) {
    return `${label}: informe ${integer ? 'um número inteiro' : 'um número'} entre 0 e ${max}.`;
  }
}

/** Structural validation does not require a completed simulation or rewrite legacy snapshots. */
export function validateState(value: unknown): string[] {
  if (!isRecord(value)) return ['Os dados da simulação são inválidos.'];
  const errors: string[] = [];
  const check = (raw: unknown, label: string, max?: number, integer?: boolean) => {
    const error = numberError(raw, label, max, integer);
    if (error) errors.push(error);
  };
  for (const field of monetaryFields) check(value[field], field);
  for (const field of percentFields) check(value[field], field, field.startsWith('lucro') ? 10_000 : 100);
  for (const [field, limit] of Object.entries(operationLimits)) check(value[field], field, limit, true);
  if (typeof value.nome !== 'string' || value.nome.length > 200) errors.push('Nome do procedimento inválido (máximo de 200 caracteres).');
  if (!Array.isArray(value.insumos) || value.insumos.length > 100) {
    errors.push('Informe no máximo 100 insumos.');
  } else {
    value.insumos.forEach((item, index) => {
      const label = `Insumo ${index + 1}`;
      if (!isRecord(item)) { errors.push(`${label}: dados inválidos.`); return; }
      if (typeof item.nome !== 'string' || item.nome.length > 200) errors.push(`${label}: nome inválido.`);
      check(item.valor, `${label}: custo unitário`);
      if (item.quantidade !== undefined) check(item.quantidade, `${label}: quantidade`, 1_000_000);
      if (item.perdaPercentual !== undefined) {
        check(item.perdaPercentual, `${label}: perda`, 100);
        if (item.perdaPercentual === 100) errors.push(`${label}: a perda deve ser menor que 100%.`);
      }
      if (item.unidade !== undefined && (typeof item.unidade !== 'string' || item.unidade.length > 30)) errors.push(`${label}: unidade inválida.`);
    });
  }
  if (value.pricing !== undefined) {
    const p = value.pricing;
    if (!isRecord(p) || p.version !== 2) return [...errors, 'Versão da precificação não reconhecida.'];
    for (const field of ['professionalFixed', 'paymentFixed', 'finalPrice']) check(p[field], field);
    for (const field of ['occupancy', 'professionalPercent', 'salesCommission', 'targetMargin', 'minMargin']) check(p[field], field, 100);
    check(p.preparationMinutes, 'Tempo de preparação', 1440, true);
    check(p.installments, 'Parcelas', 18, true);
    if (p.installments === 0) errors.push('Informe entre 1 e 18 parcelas.');
    if (typeof p.unit !== 'string' || (p.unit !== '' && !units.includes(p.unit))) errors.push('Selecione Osasco, SBC ou SCS.');
    if (typeof p.referenceMonth !== 'string' || (p.referenceMonth !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.referenceMonth))) errors.push('Mês de referência inválido. Use AAAA-MM.');
    if (typeof p.paymentLabel !== 'string' || p.paymentLabel.length > 200) errors.push('Identificação da taxa de pagamento inválida.');
  }
  return errors;
}

function emptyResult(errors: string[], warnings: string[] = [], context: Partial<ReturnType<typeof monthlyCosts>> & { horasProdutivas?: number } = {}) {
  return {
    fixos: 0, variaveis: 0, custosMensais: 0, horaMaca: 0, totalInsumos: 0,
    baseCusto: 0, lucroClinicaVal: 0, lucroParceiroVal: 0, preco: 0, impostosVal: 0,
    custoHoraProcedimento: 0, valid: false, errors, warnings, piso: 0,
    precoMinimoMargem: 0, precoTabela: 0, precoPix: 0, precoComercial: 0,
    precoCobrado: 0, lucroEfetivo: 0, margemEfetiva: 0, descontoMaximo: 0,
    horasProdutivas: 0, parcelas: [] as number[], custoDireto: 0, ...context,
  };
}

// Correct only floating-point noise around exact cents, never a real fraction of a cent.
function ceilCents(value: number) {
  const cents = value * 100;
  const nearest = Math.round(cents);
  return (Math.abs(cents - nearest) <= Number.EPSILON * Math.max(1, Math.abs(cents)) * 4 ? nearest : Math.ceil(cents)) / 100;
}

function monthlyCosts(s: CalcState) {
  const fixos = s.aluguel + s.energiaEletrica + s.aguaInternet + s.contador + s.salarios + s.proLabore;
  const variaveis = s.materiaisGerais + s.marketingTrafego + s.comissoes + s.taxasPlataformas + s.outros;
  return { fixos, variaveis, custosMensais: fixos + variaveis };
}

function legacyCalc(s: CalcState) {
  const monthly = monthlyCosts(s);
  const horasMes = s.diasTrabalhados * (s.horasDia + s.minutosDia / 60);
  const horaMaca = horasMes > 0 && s.qtdSalas > 0 ? monthly.custosMensais / horasMes / s.qtdSalas : 0;
  const totalInsumos = s.insumos.reduce((a, i) => a + i.valor, 0) + s.locacaoAparelho;
  const custoHoraProcedimento = horaMaca * (s.duracaoHoras + s.duracaoMinutos / 60);
  const baseCusto = custoHoraProcedimento + totalInsumos;
  const lucroClinicaVal = baseCusto * (s.lucroClinica / 100);
  const lucroParceiroVal = baseCusto * (s.lucroParceiro / 100);
  const subtotal = baseCusto + lucroClinicaVal + lucroParceiroVal;
  const totalDeducoes = (s.impostos + s.taxaCartao + s.descontoPaciente) / 100;
  const preco = totalDeducoes < 1 ? subtotal / (1 - totalDeducoes) : subtotal;
  const errors = totalDeducoes >= 1 ? ['A soma das deduções do cálculo legado deve ser menor que 100%.'] : [];
  if (horasMes <= 0 || s.qtdSalas <= 0) errors.push('Informe dias, horas e salas maiores que zero.');
  if (s.duracaoHoras + s.duracaoMinutos / 60 <= 0) errors.push('Informe a duração do atendimento.');
  if (baseCusto <= 0) errors.push('Informe custos maiores que zero.');
  if (s.horasDia + s.minutosDia / 60 > 24) errors.push('O expediente não pode ultrapassar 24 horas por dia.');
  if (!Number.isFinite(preco) || preco > MAX_RESULT) errors.push('O preço calculado excede o limite da simulação.');
  const lucroEfetivo = lucroClinicaVal + lucroParceiroVal;
  return {
    ...monthly, horaMaca, totalInsumos, baseCusto, lucroClinicaVal, lucroParceiroVal, preco,
    impostosVal: preco - subtotal, custoHoraProcedimento, valid: errors.length === 0, errors,
    warnings: ['Cálculo legado preservado: lucro é acréscimo sobre custo, não margem sobre venda.'],
    piso: totalDeducoes < 1 ? baseCusto / (1 - totalDeducoes) : 0,
    precoMinimoMargem: totalDeducoes < 1 ? baseCusto / (1 - totalDeducoes) : 0,
    precoTabela: preco, precoPix: 0, precoComercial: preco, precoCobrado: preco,
    lucroEfetivo, margemEfetiva: preco > 0 ? lucroEfetivo / preco * 100 : 0,
    descontoMaximo: 0, horasProdutivas: horasMes * s.qtdSalas,
    parcelas: [preco], custoDireto: totalInsumos,
  };
}

export function calc(s: CalcState) {
  const structuralErrors = validateState(s);
  if (structuralErrors.length) return emptyResult(structuralErrors);
  if (!s.pricing) return legacyCalc(s);
  const p = s.pricing;
  const warnings = [
    'Confira impostos efetivos com o contador e taxas da forma de pagamento; valores zerados não significam isenção.',
    'O piso depende dos custos e da ocupação informados. Não conte materiais ou remuneração duas vezes.',
  ];
  if (!p.unit || !p.referenceMonth) warnings.push('Informe unidade e mês de referência antes de salvar.');
  if (p.targetMargin === 0) warnings.push('A margem-alvo está zerada: o preço cobre os custos informados, sem reserva de lucro.');
  const errors: string[] = [];
  const monthly = monthlyCosts(s);
  const availableHours = s.diasTrabalhados * (s.horasDia + s.minutosDia / 60) * s.qtdSalas;
  const horasProdutivas = availableHours * p.occupancy / 100;
  const duration = s.duracaoHoras + (s.duracaoMinutos + p.preparationMinutes) / 60;
  const deductions = (s.impostos + s.taxaCartao + p.professionalPercent + p.salesCommission) / 100;
  const margin = p.targetMargin / 100;
  const minMargin = p.minMargin / 100;
  const discount = s.descontoPaciente / 100;
  if (s.horasDia + s.minutosDia / 60 > 24) errors.push('O expediente não pode ultrapassar 24 horas por dia.');
  if (horasProdutivas <= 0) errors.push('Informe dias, horas, salas e ocupação maiores que zero.');
  if (s.duracaoHoras + s.duracaoMinutos / 60 <= 0) errors.push('Informe a duração do atendimento, além do tempo de preparação.');
  if (deductions + margin >= 1) errors.push('A soma de impostos, taxas, comissões e margem-alvo deve ser menor que 100%.');
  if (deductions + minMargin >= 1) errors.push('A soma das despesas percentuais e margem mínima deve ser menor que 100%.');
  if (minMargin > margin) errors.push('A margem mínima não pode superar a margem-alvo.');
  if (discount >= 1) errors.push('O desconto deve ser menor que 100%.');
  const context = { ...monthly, horasProdutivas };
  if (errors.length) return emptyResult(errors, warnings, context);
  const horaMaca = monthly.custosMensais / horasProdutivas;
  const totalInsumos = s.insumos.reduce((sum, item) => (
    sum + item.valor * (item.quantidade ?? 1) / (1 - (item.perdaPercentual ?? 0) / 100)
  ), 0) + s.locacaoAparelho;
  const custoDireto = totalInsumos + p.professionalFixed;
  const custoHoraProcedimento = horaMaca * duration;
  const baseCusto = custoDireto + custoHoraProcedimento;
  if (baseCusto <= 0) return emptyResult(['Informe custos do procedimento e/ou da estrutura maiores que zero.'], warnings, context);
  if (monthly.custosMensais === 0) warnings.push('A estrutura mensal está zerada: confirme se todos os custos estão incluídos.');
  const costWithPayment = baseCusto + p.paymentFixed;
  const piso = ceilCents(costWithPayment / (1 - deductions));
  const precoMinimoMargem = ceilCents(costWithPayment / (1 - deductions - minMargin));
  const preco = ceilCents(costWithPayment / (1 - deductions - margin));
  const precoTabela = ceilCents(preco / (1 - discount));
  const precoPix = ceilCents(baseCusto / (1 - deductions + s.taxaCartao / 100 - margin));
  const precoComercial = p.finalPrice > 0 ? ceilCents(p.finalPrice) : precoTabela;
  const precoCobrado = Math.round((precoComercial * (1 - discount) + Number.EPSILON) * 100) / 100;
  if (precoCobrado <= 0) return emptyResult(['O preço após desconto deve ser de pelo menos R$ 0,01.'], warnings, context);
  const lucroEfetivo = precoCobrado * (1 - deductions) - costWithPayment;
  const margemEfetiva = precoCobrado > 0 ? lucroEfetivo / precoCobrado * 100 : 0;
  const descontoMaximo = Math.max(0, Math.floor((1 - precoMinimoMargem / precoComercial) * 10_000) / 100);
  if (precoCobrado < precoMinimoMargem) warnings.push('O preço cobrado está abaixo do necessário para preservar a margem mínima.');
  const monetaryResults = [baseCusto, horaMaca, preco, precoTabela, piso, precoMinimoMargem, precoPix, precoComercial, precoCobrado];
  if (monetaryResults.some(value => !Number.isFinite(value) || value > MAX_RESULT)) {
    return emptyResult(['Os valores calculados excedem o limite da simulação. Revise custos, perdas e percentuais.'], warnings, context);
  }
  return {
    ...monthly, horaMaca, totalInsumos, baseCusto, custoHoraProcedimento, custoDireto,
    lucroClinicaVal: preco * margin, lucroParceiroVal: preco * p.professionalPercent / 100,
    preco, impostosVal: preco * deductions + p.paymentFixed, valid: true, errors: [], warnings,
    piso, precoMinimoMargem, precoTabela, precoPix, precoComercial, precoCobrado,
    lucroEfetivo, margemEfetiva, descontoMaximo, horasProdutivas,
    parcelas: splitAmountIntoInstallments(precoCobrado, p.installments),
  };
}

function cleanItems(items: Insumo[]): Insumo[] {
  return items.map(item => ({
    nome: item.nome, valor: item.valor,
    ...(item.quantidade !== undefined ? { quantidade: item.quantidade } : {}),
    ...(item.perdaPercentual !== undefined ? { perdaPercentual: item.perdaPercentual } : {}),
    ...(item.unidade !== undefined ? { unidade: item.unidade } : {}),
  }));
}

function cleanPricing(pricing: PricingOptions): PricingOptions {
  return Object.fromEntries(Object.keys(defaultPricing).map(key => [key, pricing[key as keyof PricingOptions]])) as unknown as PricingOptions;
}

/** Store v2 in the existing JSON column; old arrays remain old calculations. */
export function serializeProtocol(s: CalcState) {
  const result = calc(s);
  if (!result.valid) throw new Error(result.errors.join(' '));
  if (!s.nome.trim()) throw new Error('Informe o nome do procedimento.');
  if (s.pricing && (!s.pricing.unit || !s.pricing.referenceMonth)) throw new Error('Informe unidade e mês de referência.');
  const items = cleanItems(s.insumos);
  const scalarFields = Object.fromEntries(numericFields.map(key => [key, s[key]])) as Pick<CalcState, typeof numericFields[number]>;
  return {
    name: s.nome.trim(), unit: s.pricing?.unit ?? 'Todas', ...scalarFields,
    insumos: s.pricing ? { version: 2 as const, items, pricing: cleanPricing(s.pricing) } : items,
    precoSugerido: result.preco,
  };
}

/** Reject malformed snapshots rather than applying today's defaults to historical prices. */
export function deserializeProtocol(record: unknown): CalcState {
  if (!isRecord(record)) throw new Error('Protocolo inválido.');
  const rawInsumos = record.insumos;
  let items: unknown;
  let pricing: unknown;
  if (Array.isArray(rawInsumos)) {
    items = rawInsumos;
  } else if (isRecord(rawInsumos) && rawInsumos.version === 2 && Array.isArray(rawInsumos.items)) {
    items = rawInsumos.items;
    pricing = rawInsumos.pricing;
    if (!isRecord(pricing) || pricing.version !== 2) throw new Error('Configuração da precificação v2 inválida.');
    if (record.unit !== undefined && pricing.unit !== record.unit) throw new Error('A unidade do protocolo difere da unidade da simulação.');
  } else {
    throw new Error('Versão ou lista de insumos do protocolo inválida.');
  }
  const state = {
    ...Object.fromEntries(numericFields.map(key => [key, record[key]])),
    nome: record.name, insumos: items,
    ...(pricing !== undefined ? { pricing } : {}),
  };
  const errors = validateState(state);
  if (errors.length) throw new Error(errors.join(' '));
  const validated = state as CalcState;
  return {
    ...validated, insumos: cleanItems(validated.insumos),
    ...(validated.pricing ? { pricing: cleanPricing(validated.pricing) } : {}),
  };
}
