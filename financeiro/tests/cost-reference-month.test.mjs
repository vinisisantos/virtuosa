import assert from 'node:assert/strict';
import test from 'node:test';
import {
  costEntryMatchesMonth,
  normalizeCostReferenceMonth,
  resolveCostReferenceMonth,
} from '../src/lib/cost-reference-month.ts';

test('mantém o formato canônico de mês e rejeita datas inválidas', () => {
  assert.equal(normalizeCostReferenceMonth('2026-09'), '2026-09');
  assert.equal(normalizeCostReferenceMonth('2026-13'), undefined);
  assert.equal(normalizeCostReferenceMonth(''), undefined);
});

test('normaliza mês digitado em português ou no formato numérico', () => {
  assert.equal(normalizeCostReferenceMonth('Setembro', 2026), '2026-09');
  assert.equal(normalizeCostReferenceMonth('março de 2025'), '2025-03');
  assert.equal(normalizeCostReferenceMonth('9/2026'), '2026-09');
});

test('usa o ano do vencimento para recuperar referências legadas', () => {
  assert.equal(resolveCostReferenceMonth('Setembro ', '2026-09-01', 2024), '2026-09');
  assert.equal(resolveCostReferenceMonth('valor inválido', '2026-09-01', 2024), undefined);
});

test('mantém visível no mês correto a despesa salva com referência legada', () => {
  assert.equal(costEntryMatchesMonth('Setembro ', '2026-09-01', 2026, 8), true);
  assert.equal(costEntryMatchesMonth('Setembro ', '2026-09-01', 2026, 7), false);
  assert.equal(costEntryMatchesMonth('valor inválido', '2026-09-01', 2026, 8), true);
});
