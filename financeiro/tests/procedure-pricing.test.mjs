import assert from 'node:assert/strict';
import test from 'node:test';
import { calc, defaultState, defaultPricing, deserializeProtocol, serializeProtocol, validateState } from '../src/lib/procedure-pricing.ts';

function fixture(overrides = {}, pricing = {}) {
  return {
    ...structuredClone(defaultState), nome: 'Procedimento de teste', aluguel: 12_000,
    diasTrabalhados: 20, horasDia: 10, qtdSalas: 1,
    insumos: [{ nome: 'Produto', valor: 300 }], impostos: 6, taxaCartao: 4,
    ...overrides,
    pricing: { ...defaultPricing, unit: 'SBC', referenceMonth: '2026-09', occupancy: 50, salesCommission: 10, targetMargin: 20, ...pricing },
  };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('defaults v2 não presumem taxas, margem nem ocupação e não sugerem preço sem custos', () => {
  assert.equal(defaultState.impostos, 0);
  assert.equal(defaultState.taxaCartao, 0);
  assert.equal(defaultState.pricing.occupancy, 0);
  assert.equal(defaultState.pricing.targetMargin, 0);
  const result = calc(defaultState);
  assert.equal(result.valid, false);
  assert.equal(result.preco, 0);
});

test('custo 420 com despesas 20% e margem 20% resulta em alvo 700, não markup', () => {
  const r = calc(fixture());
  assert.equal(r.valid, true);
  assert.equal(r.horasProdutivas, 100);
  assert.equal(r.horaMaca, 120);
  assert.equal(r.baseCusto, 420);
  assert.equal(r.preco, 700);
  assert.equal(r.piso, 525);
  assert.equal(r.precoTabela, 700);
  near(r.margemEfetiva, 20);
  near(r.lucroEfetivo, 140);
});

test('tabela e preço cobrado separam desconto de impostos e taxas', () => {
  const r = calc(fixture({ descontoPaciente: 10 }));
  assert.equal(r.preco, 700);
  assert.equal(r.precoTabela, 777.78);
  assert.equal(r.precoComercial, 777.78);
  assert.equal(r.precoCobrado, 700);
  near(r.margemEfetiva, 20);
});

test('preço comercial informado é antes do desconto e mostra margem efetiva menor', () => {
  const r = calc(fixture({ descontoPaciente: 10 }, { finalPrice: 600, minMargin: 10 }));
  assert.equal(r.precoComercial, 600);
  assert.equal(r.precoCobrado, 540);
  near(r.lucroEfetivo, 12);
  assert.ok(r.warnings.some(message => message.includes('margem mínima')));
  assert.equal(r.precoMinimoMargem, 600);
  assert.equal(r.descontoMaximo, 0);
});

test('reduzir ocupação aumenta parcela da estrutura sem mudar o custo direto', () => {
  const half = calc(fixture({}, { occupancy: 50 }));
  const full = calc(fixture({}, { occupancy: 100 }));
  assert.equal(half.custoDireto, full.custoDireto);
  assert.equal(half.custoHoraProcedimento, full.custoHoraProcedimento * 2);
});

test('salas, minutos de expediente e preparação entram na capacidade e duração', () => {
  const r = calc(fixture({ aluguel: 10_000, diasTrabalhados: 20, horasDia: 8, minutosDia: 20, qtdSalas: 2, duracaoHoras: 0, duracaoMinutos: 30 }, { occupancy: 60, preparationMinutes: 30 }));
  near(r.horasProdutivas, 200);
  near(r.horaMaca, 50);
  near(r.custoHoraProcedimento, 50);
});

test('quantidade e perda calculam consumo real e locação não vira insumo padrão duplicado', () => {
  const r = calc(fixture({ insumos: [{ nome: 'ml', valor: 10, quantidade: 18, perdaPercentual: 10 }], locacaoAparelho: 50 }, { professionalFixed: 30 }));
  assert.equal(r.totalInsumos, 250);
  assert.equal(r.custoDireto, 280);
  assert.equal(r.baseCusto, 400);
  assert.equal(defaultState.insumos.some(item => item.nome.includes('Locação')), false);
});

test('honorário fixo entra no custo e profissional percentual entra na receita', () => {
  const r = calc(fixture({ aluguel: 0, insumos: [{ nome: 'Produto', valor: 100 }], impostos: 0, taxaCartao: 0 }, { professionalFixed: 20, professionalPercent: 10, salesCommission: 0, targetMargin: 30 }));
  assert.equal(r.baseCusto, 120);
  assert.equal(r.preco, 200);
  assert.equal(r.lucroParceiroVal, 20);
  near(r.lucroEfetivo, 60);
});

test('Pix é cenário sem taxa percentual/fixa de pagamento, mantendo demais deduções', () => {
  const r = calc(fixture({}, { paymentFixed: 6 }));
  assert.equal(r.preco, 710);
  assert.equal(r.precoPix, 656.25);
  assert.equal(r.piso, 532.5);
});

test('margem mínima determina desconto máximo conservador sobre preço comercial', () => {
  const r = calc(fixture({}, { finalPrice: 1000, minMargin: 10 }));
  assert.equal(r.precoMinimoMargem, 600);
  assert.equal(r.descontoMaximo, 40);
  const atLimit = calc(fixture({ descontoPaciente: r.descontoMaximo }, { finalPrice: 1000, minMargin: 10 }));
  assert.ok(atLimit.margemEfetiva >= 10 - 1e-9);
});

test('parcelas preservam o total em centavos', () => {
  const r = calc(fixture({}, { installments: 3, finalPrice: 1000 }));
  assert.deepEqual(r.parcelas, [333.34, 333.33, 333.33]);
  near(r.parcelas.reduce((sum, value) => sum + value, 0), r.precoCobrado);
});

test('preço alvo arredonda para cima sem centavo extra em divisão exata', () => {
  const exact = calc(fixture());
  assert.equal(exact.preco, 700);
  const fractional = calc(fixture({ aluguel: 0, insumos: [{ nome: 'P', valor: 1 }], impostos: 0, taxaCartao: 0 }, { salesCommission: 0, targetMargin: 40 }));
  assert.equal(fractional.preco, 1.67);
});

for (const [label, overrides, pricing] of [
  ['ocupação zero', {}, { occupancy: 0 }],
  ['sem dias', { diasTrabalhados: 0 }, {}],
  ['sem salas', { qtdSalas: 0 }, {}],
  ['sem duração', { duracaoHoras: 0, duracaoMinutos: 0 }, {}],
  ['preparo sem atendimento', { duracaoHoras: 0, duracaoMinutos: 0 }, { preparationMinutes: 30 }],
  ['taxas mais margem 100%', {}, { targetMargin: 80 }],
  ['taxas 100%', { impostos: 96 }, {}],
  ['desconto 100%', { descontoPaciente: 100 }, {}],
  ['mínima acima do alvo', {}, { minMargin: 21 }],
  ['custo zerado', { aluguel: 0, insumos: [] }, {}],
  ['24 horas e minutos extras', { horasDia: 24, minutosDia: 1 }, {}],
  ['perda 100%', { insumos: [{ nome: 'P', valor: 100, perdaPercentual: 100 }] }, {}],
  ['magnitude excessiva', { insumos: [{ nome: 'P', valor: 1e9, quantidade: 1e6 }] }, {}],
  ['preço cobrado zerado pelo desconto', { descontoPaciente: 99 }, { finalPrice: 0.01 }],
]) {
  test(`cenário inválido (${label}) não devolve preço utilizável`, () => {
    const r = calc(fixture(overrides, pricing));
    assert.equal(r.valid, false);
    assert.ok(r.errors.length > 0);
    assert.equal(r.preco, 0);
    assert.deepEqual(r.parcelas, []);
  });
}

test('rejeita tipos não numéricos, não finitos, negativos e operações fracionárias', () => {
  for (const value of [NaN, Infinity, -1, '100', null, undefined, {}, []]) {
    assert.equal(calc(fixture({ aluguel: value })).valid, false);
  }
  for (const field of ['diasTrabalhados', 'qtdSalas', 'horasDia', 'duracaoMinutos']) {
    assert.equal(calc(fixture({ [field]: 1.5 })).valid, false);
  }
  for (const installments of [0, 19, 1.5, '2', Infinity]) {
    assert.equal(calc(fixture({}, { installments })).valid, false);
  }
  assert.equal(calc(null).valid, false);
  assert.equal(calc(fixture({}, { version: 3 })).valid, false);
});

test('limita insumos e rejeita metadados inválidos', () => {
  assert.equal(calc(fixture({ insumos: Array.from({ length: 101 }, () => ({ nome: 'P', valor: 1 })) })).valid, false);
  assert.equal(calc(fixture({ insumos: [null] })).valid, false);
  assert.equal(calc(fixture({}, { unit: 'Outra' })).valid, false);
  assert.equal(calc(fixture({}, { referenceMonth: '2026-13' })).valid, false);
});

test('cenário incompleto mantém custos mensais visíveis sem sugerir preço', () => {
  const r = calc(fixture({}, { occupancy: 0 }));
  assert.equal(r.valid, false);
  assert.equal(r.custosMensais, 12_000);
  assert.equal(r.preco, 0);
});

test('margem-alvo zero emite aviso sem impor uma margem arbitrária', () => {
  const r = calc(fixture({}, { targetMargin: 0 }));
  assert.equal(r.valid, true);
  assert.equal(r.preco, r.piso);
  assert.ok(r.warnings.some(message => message.includes('margem-alvo está zerada')));
});

test('legado mantém matemática original e não aplica quantidade/perda novas', () => {
  const state = fixture({ aluguel: 0, insumos: [{ nome: 'Produto', valor: 100, quantidade: 10 }], impostos: 0, taxaCartao: 0, lucroClinica: 70 });
  delete state.pricing;
  const r = calc(state);
  assert.equal(r.valid, true);
  assert.equal(r.preco, 170);
  near(r.margemEfetiva, 41.17647058823529);
  assert.equal(r.totalInsumos, 100);
  assert.ok(r.warnings.some(message => message.includes('legado')));
});

test('legado conserva resultado histórico de fallback, mas não o valida para salvar', () => {
  const state = fixture({ impostos: 100 });
  delete state.pricing;
  const r = calc(state);
  assert.equal(r.valid, false);
  assert.equal(r.preco, r.baseCusto);
  assert.throws(() => serializeProtocol(state), /menor que 100/);
});

test('legado sem capacidade ou custo preserva dados e resultado, mas impede nova gravação', () => {
  for (const overrides of [{ diasTrabalhados: 0 }, { qtdSalas: 0 }, { aluguel: 0, insumos: [] }]) {
    const state = fixture(overrides);
    delete state.pricing;
    const r = calc(state);
    assert.equal(r.valid, false);
    assert.equal(r.custosMensais, state.aluguel);
    assert.throws(() => serializeProtocol(state));
    const record = { ...state, name: state.nome, unit: 'Todas' };
    assert.equal(deserializeProtocol(record).pricing, undefined);
  }
});

test('limites de textos são estritos sem truncar ficha técnica ou histórico', () => {
  assert.equal(calc(fixture({ nome: 'a'.repeat(200) })).valid, true);
  assert.equal(calc(fixture({ nome: 'a'.repeat(201) })).valid, false);
  assert.equal(calc(fixture({ insumos: [{ nome: 'a'.repeat(201), valor: 100 }] })).valid, false);
  assert.equal(calc(fixture({ insumos: [{ nome: 'P', valor: 100, unidade: 'a'.repeat(31) }] })).valid, false);
  assert.equal(calc(fixture({}, { paymentLabel: 'a'.repeat(201) })).valid, false);
  assert.equal(calc(fixture({}, { referenceMonth: 202609 })).valid, false);
});

test('preço manual com desconto de 10% e taxa fixa mantém sua própria margem', () => {
  const r = calc(fixture({ descontoPaciente: 10 }, { finalPrice: 1000, paymentFixed: 5 }));
  assert.equal(r.precoCobrado, 900);
  near(r.lucroEfetivo, 295);
  near(r.margemEfetiva, 295 / 900 * 100);
  assert.equal(r.preco, 708.34);
});

test('arredondamentos preservam pisos, margem e desconto máximo em cenários variados', () => {
  for (let i = 1; i <= 200; i++) {
    const s = fixture({ insumos: [{ nome: 'P', valor: i / 3.7 }], descontoPaciente: (i % 65) / 2 }, { minMargin: 5, targetMargin: 20 + i % 7, paymentFixed: i / 29, installments: 1 + i % 18 });
    const r = calc(s);
    assert.equal(r.valid, true);
    assert.ok(r.precoCobrado >= r.preco);
    assert.ok(r.margemEfetiva >= s.pricing.targetMargin - 1e-8);
    const atLimit = calc({ ...s, descontoPaciente: r.descontoMaximo, pricing: { ...s.pricing, finalPrice: r.precoComercial } });
    assert.ok(atLimit.precoCobrado >= r.precoMinimoMargem);
    assert.ok(atLimit.margemEfetiva >= s.pricing.minMargin - 1e-8);
    near(r.parcelas.reduce((sum, value) => sum + value, 0), r.precoCobrado);
  }
});

test('snapshot v2 roundtrip mantém opções, entradas e resultado sem recalcular preços externos', () => {
  const state = fixture({ descontoPaciente: 10 }, { paymentFixed: 2, minMargin: 10 });
  const snapshot = serializeProtocol(state);
  assert.equal(snapshot.insumos.version, 2);
  assert.equal(snapshot.precoSugerido, calc(state).preco);
  const restored = deserializeProtocol(snapshot);
  assert.deepEqual(restored, state);
  assert.deepEqual(calc(restored), calc(state));
});

test('snapshot legado permanece array e sem propriedade pricing', () => {
  const state = fixture();
  delete state.pricing;
  const snapshot = serializeProtocol(state);
  assert.ok(Array.isArray(snapshot.insumos));
  const restored = deserializeProtocol(snapshot);
  assert.equal(restored.pricing, undefined);
  assert.deepEqual(calc(restored), calc(state));
});

test('serializer recalcula preço e descarta campos alheios no estado e JSON', () => {
  const state = fixture({ precoSugerido: 1, id: 'injetado', userId: 'injetado', insumos: [{ nome: 'Produto', valor: 300, extra: 'x' }] }, { extra: 'x' });
  const snapshot = serializeProtocol(state);
  assert.equal(snapshot.precoSugerido, 700);
  assert.equal(snapshot.id, undefined);
  assert.equal(snapshot.userId, undefined);
  assert.equal(snapshot.insumos.items[0].extra, undefined);
  assert.equal(snapshot.insumos.pricing.extra, undefined);
});

test('salvar exige identificação e cenário válido; editar estado incompleto continua permitido', () => {
  assert.deepEqual(validateState(defaultState), []);
  assert.throws(() => serializeProtocol(defaultState));
  assert.throws(() => serializeProtocol(fixture({ nome: ' ' })), /nome/);
  assert.throws(() => serializeProtocol(fixture({}, { unit: '' })), /unidade/);
  assert.throws(() => serializeProtocol(fixture({}, { referenceMonth: '' })), /mês/);
});

test('desserialização estrita rejeita versão desconhecida, campos ausentes e unidade divergente', () => {
  const snapshot = serializeProtocol(fixture());
  assert.throws(() => deserializeProtocol({ ...snapshot, insumos: { version: 3, items: [] } }), /Versão/);
  assert.throws(() => deserializeProtocol({ ...snapshot, insumos: { version: 2, items: [] } }), /Configuração/);
  assert.throws(() => deserializeProtocol({ ...snapshot, aluguel: undefined }), /aluguel/);
  assert.throws(() => deserializeProtocol({ ...snapshot, unit: 'Osasco' }), /unidade/);
  assert.throws(() => deserializeProtocol(null), /inválido/);
});
