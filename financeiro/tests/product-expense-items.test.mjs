import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProductExpenseCategory,
  normalizeProductExpenseItems,
  sumProductExpenseItems,
} from '../src/lib/product-expense-items.ts';

test('reconhece a categoria Produtos sem depender de caixa ou espaços', () => {
  assert.equal(isProductExpenseCategory('Produtos'), true);
  assert.equal(isProductExpenseCategory('  PRODUTOS  '), true);
  assert.equal(isProductExpenseCategory('Fornecedores'), false);
});

test('normaliza itens válidos e descarta linhas incompletas', () => {
  assert.deepEqual(normalizeProductExpenseItems([
    { id: 'item-a', name: '  Toxina  ', value: 123.456 },
    { id: '', name: 'Luvas', value: 49.9 },
    { id: 'sem-nome', name: '   ', value: 10 },
    { id: 'sem-valor', name: 'Seringa', value: 0 },
    null,
  ]), [
    { id: 'item-a', name: 'Toxina', value: 123.46 },
    { id: 'produto-2', name: 'Luvas', value: 49.9 },
  ]);
});

test('soma os itens em centavos sem acumular erro decimal', () => {
  assert.equal(sumProductExpenseItems([
    { value: 10.1 },
    { value: 20.2 },
    { value: 0.3 },
  ]), 30.6);
});
