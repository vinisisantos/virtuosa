import { calc, type CalcState } from '@/lib/procedure-pricing';

export const PRICING_SOURCES = [
  { label: 'Sebrae · custos, mercado e margem', url: 'https://meuatendimento.sebrae.com.br/sites/PortalSebrae/artigos/como-definir-o-preco-de-venda-de-um-produto-ou-servico,cc9836627a963410VgnVCM1000003b74010aRCRD' },
  { label: 'Sebrae · margem de contribuição', url: 'https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/bds/bds.nsf/E809A7FF3D9553E90325714700620C06/$File/NT00031FEA.pdf' },
] as const;

/** Decision support for the same scenario used by the editor, persistence and report. */
export function pricingInsights(s: CalcState, r = calc(s)) {
  const p = s.pricing;
  if (!p || !r.valid) return null;
  const status = r.precoCobrado < r.piso ? 'loss'
    : r.precoCobrado < r.precoMinimoMargem ? 'below-minimum'
    : p.targetMargin === 0 ? 'no-target'
    : r.precoCobrado < r.preco ? 'negotiation' : 'target';
  const labels = {
    loss: 'Abaixo do custo total',
    'below-minimum': 'Abaixo da margem mínima',
    'no-target': 'Custo coberto · defina uma meta',
    negotiation: 'Faixa de negociação',
    target: 'Meta de margem atingida',
  };
  const guidance = {
    loss: 'O valor cobrado não cobre todos os custos atribuídos. Revise preço, desconto, custos ou ocupação antes de aprovar.',
    'below-minimum': 'Os custos são cobertos, mas a margem mínima definida não é preservada. Reduza o desconto ou reveja o preço.',
    'no-target': 'A meta de lucro está zerada. Defina a margem desejada para obter uma recomendação que inclua resultado para a clínica.',
    negotiation: 'O preço preserva a margem mínima, mas fica abaixo da meta. Use esta faixa apenas como uma decisão de negociação.',
    target: 'O preço preserva a meta no cenário informado. Confira a faixa de mercado, o diferencial do serviço e a demanda antes de defini-lo.',
  };
  const deductions = (s.impostos + s.taxaCartao + p.professionalPercent + p.salesCommission) / 100;
  const variableCost = r.custoDireto + p.paymentFixed + r.precoCobrado * deductions;
  const contribution = r.precoCobrado - variableCost;
  const duration = s.duracaoHoras + (s.duracaoMinutos + p.preparationMinutes) / 60;
  const capacity = Math.floor(r.horasProdutivas / duration);
  // This is a single-service scenario, not the actual break-even of a mixed clinic.
  const quotient = contribution > 0 ? r.custosMensais / contribution : null;
  const breakEvenSessions = quotient === null ? null : Math.ceil(quotient - Number.EPSILON * Math.max(1, quotient) * 4);
  const low = p.marketLow ?? 0;
  const high = p.marketHigh ?? 0;
  const marketStatus = !low || !high ? 'missing' : r.precoCobrado < low ? 'below' : r.precoCobrado > high ? 'above' : 'within';
  const marketLabels = { missing: 'Mercado ainda não informado', below: 'Abaixo da faixa pesquisada', above: 'Acima da faixa pesquisada', within: 'Dentro da faixa pesquisada' };
  return {
    status, label: labels[status], guidance: guidance[status], variableCost, contribution,
    contributionPercent: contribution / r.precoCobrado * 100,
    markup: r.precoCobrado / (r.baseCusto + p.paymentFixed),
    breakEvenSessions, capacity,
    exceedsCapacity: breakEvenSessions === null || breakEvenSessions > capacity,
    marketStatus, marketLabel: marketLabels[marketStatus],
    targetAboveMarket: high > 0 && r.preco > high,
    minimumAboveMarket: high > 0 && r.precoMinimoMargem > high,
  };
}
