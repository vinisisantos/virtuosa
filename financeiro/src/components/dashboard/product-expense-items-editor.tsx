'use client';

import { formatCurrency } from '@/hooks/useDashboard';
import { formatCurrency as formatBRL } from '@/lib/currency';
import { sumProductExpenseItems } from '@/lib/product-expense-items';

export interface EditableProductExpenseItem {
  id: string;
  name: string;
  quantity: string;
  value: string;
}

interface ProductExpenseItemsEditorProps {
  items: EditableProductExpenseItem[];
  total: number;
  onChange: (items: EditableProductExpenseItem[]) => void;
}

function createItem(): EditableProductExpenseItem {
  return {
    id: `produto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    quantity: '1',
    value: '',
  };
}

function currencyInputToNumber(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) / 100 : 0;
}

function itemSubtotal(item: EditableProductExpenseItem) {
  return sumProductExpenseItems([{
    quantity: Number(item.quantity),
    value: currencyInputToNumber(item.value),
  }]);
}

export function ProductExpenseItemsEditor({ items, total, onChange }: ProductExpenseItemsEditorProps) {
  const updateItem = (id: string, patch: Partial<EditableProductExpenseItem>) => {
    onChange(items.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const removeItem = (id: string) => {
    const remaining = items.filter(item => item.id !== id);
    onChange(remaining.length > 0 ? remaining : [createItem()]);
  };

  return (
    <section aria-labelledby="product-expense-items-title" style={{ padding: 14, border: '1px solid rgba(249,115,22,0.3)', borderRadius: 12, background: 'rgba(249,115,22,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div id="product-expense-items-title" style={{ color: 'var(--text-main)', fontSize: '0.84rem', fontWeight: 800 }}>Itens da despesa</div>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.4 }}>Informe cada produto, sua quantidade e o valor unitário.</div>
        </div>
        <span style={{ flexShrink: 0, color: '#f97316', fontSize: '0.78rem', fontWeight: 850 }}>{formatBRL(total)}</span>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item, index) => (
          <div className="product-expense-item-row" key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 84px 124px 44px', gap: 8, alignItems: 'end' }}>
            <div className="product-expense-item-name" style={{ minWidth: 0 }}>
              <label htmlFor={`product-expense-name-${item.id}`} style={{ display: 'block', marginBottom: 5, color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700 }}>Produto {index + 1}</label>
              <input
                id={`product-expense-name-${item.id}`}
                value={item.name}
                onChange={event => updateItem(item.id, { name: event.target.value })}
                placeholder="Nome do produto"
                style={{ width: '100%', height: 44, padding: '10px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', fontSize: '0.82rem' }}
              />
            </div>
            <div className="product-expense-item-quantity" style={{ minWidth: 0 }}>
              <label htmlFor={`product-expense-quantity-${item.id}`} style={{ display: 'block', marginBottom: 5, color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700 }}>Qtd.</label>
              <input
                id={`product-expense-quantity-${item.id}`}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={item.quantity}
                onChange={event => updateItem(item.id, { quantity: event.target.value.replace(/\D/g, '') })}
                placeholder="1"
                style={{ width: '100%', height: 44, padding: '10px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', fontSize: '0.82rem', fontWeight: 750, textAlign: 'center' }}
              />
            </div>
            <div className="product-expense-item-value" style={{ minWidth: 0 }}>
              <label htmlFor={`product-expense-value-${item.id}`} style={{ display: 'block', marginBottom: 5, color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700 }}>Valor unitário</label>
              <input
                id={`product-expense-value-${item.id}`}
                inputMode="numeric"
                value={item.value}
                onChange={event => updateItem(item.id, { value: formatCurrency(event.target.value) })}
                placeholder="0,00"
                style={{ width: '100%', height: 44, padding: '10px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', fontSize: '0.82rem', fontWeight: 750 }}
              />
              <div aria-live="polite" style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.64rem', fontWeight: 700, textAlign: 'right' }}>
                Subtotal {formatBRL(itemSubtotal(item))}
              </div>
            </div>
            <button
              className="product-expense-item-remove"
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label={`Remover produto ${index + 1}`}
              title="Remover produto"
              style={{ width: 44, height: 44, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card-bg)', color: '#ef4444', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 19 }}>delete</span>
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...items, createItem()])}
        style={{ width: '100%', minHeight: 44, marginTop: 12, borderRadius: 9, border: '1px dashed rgba(249,115,22,0.5)', background: 'transparent', color: '#f97316', cursor: 'pointer', font: 'inherit', fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
        Adicionar outro produto
      </button>
    </section>
  );
}
