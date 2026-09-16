import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState, defaultPricing, calc, serializeProtocol, deserializeProtocol, validateState } from '../src/lib/procedure-pricing.ts';
import { pricingInsights } from '../src/lib/pricing-insights.ts';
import { buildPricingReportHtml } from '../src/app/calculadora/pdfGenerator.ts';

const scenario = (overrides = {}) => ({
  ...defaultState, nome: 'Sessão de teste', aluguel: 1000, diasTrabalhados: 20, horasDia: 5,
  insumos: [{ nome: 'Consumo', valor: 30 }], impostos: 10,
  pricing: { ...defaultPricing, unit: 'Osasco', referenceMonth: '2026-09', occupancy: 100, targetMargin: 20, minMargin: 10, ...overrides },
});

test('classifica o preço por cobertura e metas configuradas, sem margem universal', () => {
  for (const [finalPrice, status] of [[40, 'loss'], [48, 'below-minimum'], [52, 'negotiation'], [60, 'target']]) {
    assert.equal(pricingInsights(scenario({ finalPrice })).status, status);
  }
  assert.equal(pricingInsights(scenario({ targetMargin: 0, minMargin: 0 })).status, 'no-target');
  assert.equal(pricingInsights({ ...scenario(), pricing: undefined }), null);
  assert.equal(pricingInsights(scenario({ occupancy: 0 })), null);
});

test('contribuição exclui variáveis e ainda cobre a estrutura, sem confundir com lucro', () => {
  const s = scenario({ finalPrice: 60 });
  const r = calc(s);
  const insight = pricingInsights(s);
  assert.equal(insight.contribution, 24); // 60 - 30 de insumo - 6 de imposto
  assert.equal(insight.contributionPercent, 40);
  assert.equal(r.lucroEfetivo, 14); // contribuição - 10 de estrutura
  assert.equal(insight.breakEvenSessions, 42);
  assert.equal(insight.capacity, 100);
  assert.equal(insight.markup, 1.5);
  assert.equal(insight.exceedsCapacity, false);
});

test('equilíbrio usa preparo, ocupação e contribuição não positiva', () => {
  const noContribution = pricingInsights(scenario({ finalPrice: 20 }));
  assert.equal(noContribution.breakEvenSessions, null);
  assert.equal(noContribution.exceedsCapacity, true);
  const limited = pricingInsights(scenario({ finalPrice: 45, occupancy: 50, preparationMinutes: 30 }));
  assert.equal(limited.capacity, 33);
  assert.equal(limited.exceedsCapacity, true);
});

test('desconto altera classificação e contribuição com base no que o cliente paga', () => {
  const s = { ...scenario({ finalPrice: 60 }), descontoPaciente: 20 };
  assert.equal(calc(s).precoCobrado, 48);
  assert.equal(pricingInsights(s).status, 'below-minimum');
  assert.ok(Math.abs(pricingInsights(s).contribution - 13.2) < 1e-10);
});

test('pesquisa de mercado compara somente a faixa informada e aponta conflito de meta', () => {
  assert.equal(pricingInsights(scenario()).marketStatus, 'missing');
  for (const [finalPrice, expected] of [[49, 'below'], [50, 'within'], [60, 'within'], [61, 'above']]) {
    assert.equal(pricingInsights(scenario({ finalPrice, marketLow: 50, marketHigh: 60 })).marketStatus, expected);
  }
  assert.equal(pricingInsights(scenario({ marketLow: 40, marketHigh: 45 })).minimumAboveMarket, true);
  assert.equal(pricingInsights(scenario({ marketLow: 50, marketHigh: 55 })).targetAboveMarket, true);
});

test('campos de mercado são opcionais, validados e preservados no JSON existente', () => {
  const old = scenario();
  assert.deepEqual(deserializeProtocol(serializeProtocol(old)), old);
  const current = scenario({ marketLow: 50, marketHigh: 70, marketReference: 'Pesquisa local, setembro de 2026' });
  assert.deepEqual(deserializeProtocol(serializeProtocol(current)), current);
  for (const invalid of [{ marketLow: 10 }, { marketHigh: 20 }, { marketLow: 30, marketHigh: 20 }, { marketLow: -1 }, { marketLow: '10' }, { marketReference: 'x'.repeat(501) }]) {
    assert.ok(validateState(scenario(invalid)).length > 0);
    assert.throws(() => serializeProtocol(scenario(invalid)));
  }
});

test('relatório inclui análise e escapa texto livre da referência de mercado', () => {
  const html = buildPricingReportHtml(scenario({ marketLow: 50, marketHigh: 70, marketReference: '<script>alert(1)</script>' }));
  assert.ok(html.includes('Decisão de venda e comparação de mercado'));
  assert.ok(html.includes('Margem de contribuição por atendimento'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});
