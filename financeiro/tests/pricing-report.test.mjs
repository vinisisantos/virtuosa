import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPricingReportHtml, generatePDF } from '../src/app/calculadora/pdfGenerator.ts';
import { calc, defaultPricing, defaultState, fmt } from '../src/lib/procedure-pricing.ts';

function simulation(overrides = {}) {
  return {
    ...defaultState,
    nome: 'Protocolo demonstrativo',
    aluguel: 1000,
    impostos: 8,
    taxaCartao: 4,
    descontoPaciente: 10,
    insumos: [{ nome: 'Material', valor: 20, quantidade: 2, perdaPercentual: 20, unidade: 'ml' }],
    pricing: {
      ...defaultPricing,
      unit: 'Osasco',
      referenceMonth: '2026-09',
      occupancy: 60,
      preparationMinutes: 15,
      professionalFixed: 30,
      professionalPercent: 5,
      salesCommission: 3,
      targetMargin: 25,
      minMargin: 15,
      paymentFixed: 2,
      installments: 3,
      paymentLabel: 'Cartão 3x',
    },
    ...overrides,
  };
}

test('relatório v2 expõe custo, premissas, preço, desconto, margem e parcelas do motor', () => {
  const state = simulation();
  const result = calc(state);
  assert.equal(result.valid, true);
  const html = buildPricingReportHtml(state);
  for (const label of [
    'Ocupação produtiva planejada', 'Horas produtivas mensais',
    'Preparo / intervalo por atendimento', 'Ficha de insumos do procedimento',
    'Piso econômico (lucro zero)', 'Preço-alvo cobrado (após desconto)',
    'Preço de tabela sugerido (antes do desconto)', 'Preço comercial escolhido (antes do desconto)',
    'Preço efetivamente cobrado', 'Margem efetiva sobre o cobrado',
    'Pagamento em 3 parcela(s)', 'Desconto máximo sobre o preço comercial',
    'Mês de referência dos custos: 2026-09', 'Unidade: Osasco',
  ]) assert.ok(html.includes(label), `Rótulo ausente: ${label}`);
  for (const amount of [result.custoDireto, result.baseCusto, result.preco, result.precoTabela, result.piso, result.precoCobrado, ...result.parcelas]) {
    assert.ok(html.includes(fmt(amount)), `Valor do motor ausente: ${amount}`);
  }
  assert.ok(html.includes(fmt(50)), 'Quantidade 2 e perda de 20% devem custar R$ 50');
  assert.ok(html.includes('não altera automaticamente os preços do catálogo'));
  assert.ok(!html.includes('@import'), 'Impressão não depende de fontes externas');
});

test('builder é determinístico, não altera a simulação e só imprime data explícita', () => {
  const state = simulation();
  const snapshot = structuredClone(state);
  assert.equal(buildPricingReportHtml(state), buildPricingReportHtml(state));
  assert.ok(!buildPricingReportHtml(state).includes('Gerado em'));
  const generatedAt = new Date('2026-09-11T15:30:00Z');
  const html = buildPricingReportHtml(state, generatedAt);
  assert.ok(html.includes('Gerado em 11/09/2026, 12:30:00'));
  assert.deepEqual(state, snapshot);
});

test('escape de nomes, insumos, unidade de medida e identificação de pagamento', () => {
  const payload = '<img src=x onerror="alert(1)"> & \'teste\'';
  const state = simulation();
  state.nome = payload;
  state.insumos[0].nome = payload;
  state.insumos[0].unidade = '<b>ml</b>';
  state.pricing.paymentLabel = payload;
  const html = buildPricingReportHtml(state);
  assert.ok(html, 'Fixture deve continuar válida');
  assert.ok(!html.includes(payload));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>ml</b>'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;teste&#39;'));
  assert.ok(html.includes('&lt;b&gt;ml&lt;/b&gt;'));
  for (const field of ['unit', 'referenceMonth']) {
    const invalid = simulation();
    invalid.pricing[field] = '<script>alert(1)</script>';
    assert.equal(buildPricingReportHtml(invalid), '', `Metadado inválido ${field} não deve virar relatório`);
  }
});

test('protocolo legado preserva preço e identifica markup em vez de margem', () => {
  const legacy = simulation({ pricing: undefined, lucroClinica: 70, lucroParceiro: 0 });
  const result = calc(legacy);
  const html = buildPricingReportHtml(legacy);
  assert.ok(html.includes('Modelo legado preservado'));
  assert.ok(html.includes('Markup da clínica'));
  assert.ok(html.includes('Markup não é margem.'));
  assert.ok(html.includes(fmt(result.preco)));
  assert.ok(!html.includes('Margem Lucro'));
  assert.ok(!html.includes('Modelo de margem v2'));
  assert.ok(!html.includes('Cenário Pix'));
});

test('relatório inválido não abre janela e popup bloqueado retorna false', () => {
  const original = globalThis.window;
  let openCount = 0;
  globalThis.window = { open() { openCount += 1; return null; } };
  try {
    const invalid = simulation();
    invalid.pricing.occupancy = 0;
    assert.equal(buildPricingReportHtml(invalid), '');
    assert.equal(generatePDF(invalid), false);
    assert.equal(openCount, 0);
    assert.equal(generatePDF(simulation()), false);
    assert.equal(openCount, 1);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test('impressão escreve HTML válido e agenda apenas uma chamada ao print', () => {
  const original = globalThis.window;
  let html = '';
  let printCount = 0;
  let callback;
  const printWindow = {
    opener: {}, closed: false,
    document: { open() {}, write(value) { html = value; }, close() {} },
    setTimeout(fn) { callback = fn; },
    focus() {}, print() { printCount += 1; }, close() {},
  };
  globalThis.window = { open() { return printWindow; } };
  try {
    assert.equal(generatePDF(simulation()), true);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.equal(printWindow.opener, null);
    assert.equal(printCount, 0);
    callback();
    assert.equal(printCount, 1);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test('geração fora do navegador retorna false sem efeitos colaterais', () => {
  const original = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(generatePDF(simulation()), false);
  } finally {
    if (original !== undefined) globalThis.window = original;
  }
});
