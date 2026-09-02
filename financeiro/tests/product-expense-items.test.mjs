import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProductExpenseCategory,
  normalizeProductExpenseFreight,
  normalizeProductExpenseItems,
  sumProductExpenseItems,
  sumProductExpenseTotal,
} from '../src/lib/product-expense-items.ts';

test('reconhece a categoria Produtos sem depender de caixa ou espaços', () => {
  assert.equal(isProductExpenseCategory('Produtos'), true);
  assert.equal(isProductExpenseCategory('  PRODUTOS  '), true);
  assert.equal(isProductExpenseCategory('Fornecedores'), false);
});

test('normaliza itens válidos e descarta linhas incompletas', () => {
  assert.deepEqual(normalizeProductExpenseItems([
    { id: 'item-a', name: '  Toxina  ', quantity: 2, value: 123.456 },
    { id: '', name: 'Luvas', value: 49.9 },
    { id: 'sem-nome', name: '   ', quantity: 1, value: 10 },
    { id: 'sem-valor', name: 'Seringa', quantity: 1, value: 0 },
    { id: 'quantidade-fracionada', name: 'Agulha', quantity: 1.5, value: 20 },
    null,
  ]), [
    { id: 'item-a', name: 'Toxina', quantity: 2, value: 123.46 },
    { id: 'produto-2', name: 'Luvas', quantity: 1, value: 49.9 },
  ]);
});

test('multiplica quantidade pelo valor unitário e soma em centavos', () => {
  assert.equal(sumProductExpenseItems([
    { quantity: 2, value: 10.1 },
    { quantity: 3, value: 20.2 },
    { quantity: 1, value: 0.3 },
  ]), 81.1);
});

test('normaliza frete opcional sem permitir valor negativo ou inválido', () => {
  assert.equal(normalizeProductExpenseFreight(15.456), 15.46);
  assert.equal(normalizeProductExpenseFreight('20.1'), 20.1);
  assert.equal(normalizeProductExpenseFreight(-1), 0);
  assert.equal(normalizeProductExpenseFreight('inválido'), 0);
});

test('soma o frete ao subtotal dos produtos sem erro decimal', () => {
  assert.equal(sumProductExpenseTotal([
    { quantity: 2, value: 10.1 },
    { quantity: 1, value: 20.2 },
  ], 12.35), 52.75);
});
