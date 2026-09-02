export interface ProductExpenseItem {
  id: string;
  name: string;
  quantity: number;
  value: number;
}

type ProductExpenseItemCandidate = Partial<ProductExpenseItem> & {
  value?: unknown;
};

export function isProductExpenseCategory(category?: string | null) {
  return (category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR') === 'produtos';
}

export function normalizeProductExpenseItems(input: unknown): ProductExpenseItem[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const item = candidate as ProductExpenseItemCandidate;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const quantity = item.quantity === undefined || item.quantity === null
      ? 1
      : Number(item.quantity);
    const value = typeof item.value === 'number' ? item.value : Number(item.value);
    if (!name || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(value) || value <= 0) return [];

    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `produto-${index + 1}`,
      name,
      quantity,
      value: Math.round((value + Number.EPSILON) * 100) / 100,
    }];
  });
}

export function sumProductExpenseItems(items: readonly Pick<ProductExpenseItem, 'quantity' | 'value'>[]) {
  const cents = items.reduce((sum, item) => (
    Number.isInteger(item.quantity) && item.quantity > 0 && Number.isFinite(item.value) && item.value > 0
      ? sum + (item.quantity * Math.round(item.value * 100))
      : sum
  ), 0);
  return cents / 100;
}

export function normalizeProductExpenseFreight(input: unknown) {
  const freight = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(freight) || freight < 0) return 0;
  return Math.round((freight + Number.EPSILON) * 100) / 100;
}

export function sumProductExpenseTotal(
  items: readonly Pick<ProductExpenseItem, 'quantity' | 'value'>[],
  freight: unknown,
) {
  const itemsCents = Math.round(sumProductExpenseItems(items) * 100);
  const freightCents = Math.round(normalizeProductExpenseFreight(freight) * 100);
  return (itemsCents + freightCents) / 100;
}
