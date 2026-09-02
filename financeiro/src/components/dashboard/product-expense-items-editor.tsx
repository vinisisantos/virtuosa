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

interface ProductExpenseSummaryProps {
  itemsSubtotal: number;
  freight: string;
  total: number;
  onFreightChange: (freight: string) => void;
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
    <>
    <section aria-labelledby="product-expense-items-title" style={{ padding: 16, border: '1px solid rgba(249,115,22,0.3)', borderRadius: 14, background: 'rgba(249,115,22,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div id="product-expense-items-title" style={{ color: 'var(--text-main)', fontSize: '0.88rem', fontWeight: 800 }}>Itens da despesa</div>
          <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.45 }}>Informe cada produto, sua quantidade e o valor unitário.</div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Produtos</div>
          <div style={{ marginTop: 2, color: '#f97316', fontSize: '0.82rem', fontWeight: 850 }}>{formatBRL(total)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((item, index) => (
          <article key={item.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 11, background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
              <div style={{ color: 'var(--text-main)', fontSize: '0.72rem', fontWeight: 800 }}>Produto {index + 1}</div>
              <div aria-live="polite" style={{ color: 'var(--text-muted)', fontSize: '0.67rem', fontWeight: 750, textAlign: 'right' }}>
                Subtotal <strong style={{ color: 'var(--text-main)' }}>{formatBRL(itemSubtotal(item))}</strong>
              </div>
            </div>
            <div className="product-expense-item-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 78px 124px 44px', gap: 8, alignItems: 'end' }}>
              <div className="product-expense-item-name" style={{ minWidth: 0 }}>
                <label htmlFor={`product-expense-name-${item.id}`} style={{ display: 'block', marginBottom: 5, color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700 }}>Descrição</label>
                <input
                  id={`product-expense-name-${item.id}`}
                  value={item.name}
                  onChange={event => updateItem(item.id, { name: event.target.value })}
                  placeholder="Nome do produto"
                  style={{ width: '100%', height: 44, padding: '10px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', fontSize: '0.82rem' }}
                />
              </div>
              <div className="product-expense-item-quantity" style={{ minWidth: 0 }}>
                <label htmlFor={`product-expense-quantity-${item.id}`} style={{ display: 'block', marginBottom: 5, color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700 }}>Quantidade</label>
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
                <label htmlFor={`product-expense-value-${item.id}`} style={{ display: 'block', marginBottom: 5, color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700 }}>Valor unitário</label>
                <input
                  id={`product-expense-value-${item.id}`}
                  inputMode="numeric"
                  value={item.value}
                  onChange={event => updateItem(item.id, { value: formatCurrency(event.target.value) })}
                  placeholder="0,00"
                  style={{ width: '100%', height: 44, padding: '10px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', fontSize: '0.82rem', fontWeight: 750 }}
                />
              </div>
              <button
                className="product-expense-item-remove"
                type="button"
                onClick={() => removeItem(item.id)}
                aria-label={`Remover produto ${index + 1}`}
                title="Remover produto"
                style={{ width: 44, height: 44, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: '#ef4444', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>delete</span>
              </button>
            </div>
          </article>
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
    <style>{`
      @media (max-width: 640px) {
        .product-expense-item-row {
          grid-template-columns: 78px minmax(0, 1fr) 44px !important;
          align-items: end !important;
        }
        .product-expense-item-name { grid-column: 1 / -1; grid-row: 1; }
        .product-expense-item-quantity { grid-column: 1; grid-row: 2; }
        .product-expense-item-value { grid-column: 2; grid-row: 2; }
        .product-expense-item-remove { grid-column: 3; grid-row: 2; }
        .product-expense-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .product-expense-summary-total { grid-column: 1 / -1; }
      }
    `}</style>
    </>
  );
}

export function ProductExpenseSummary({ itemsSubtotal, freight, total, onFreightChange }: ProductExpenseSummaryProps) {
  return (
    <section aria-labelledby="product-expense-summary-title" style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)' }}>
      <div id="product-expense-summary-title" style={{ marginBottom: 10, color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: 800 }}>Resumo da despesa</div>
      <div className="product-expense-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <div className="product-expense-summary-products" style={{ minWidth: 0, minHeight: 72, padding: 11, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 750 }}>PRODUTOS</div>
          <div aria-live="polite" style={{ marginTop: 7, color: 'var(--text-main)', fontSize: '0.88rem', fontWeight: 850 }}>{formatBRL(itemsSubtotal)}</div>
        </div>
        <label className="product-expense-summary-freight" htmlFor="product-expense-freight" style={{ display: 'block', minWidth: 0, minHeight: 72, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 750 }}>FRETE</span>
          <input
            id="product-expense-freight"
            inputMode="numeric"
            value={freight}
            onChange={event => onFreightChange(formatCurrency(event.target.value))}
            placeholder="0,00"
            aria-label="Valor do frete"
            style={{ width: '100%', height: 34, marginTop: 3, padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', fontSize: '0.84rem', fontWeight: 800 }}
          />
        </label>
        <div className="product-expense-summary-total" style={{ minWidth: 0, minHeight: 72, padding: 11, borderRadius: 10, border: '1px solid rgba(249,115,22,0.35)', background: 'rgba(249,115,22,0.08)' }}>
          <div style={{ color: '#f97316', fontSize: '0.65rem', fontWeight: 800 }}>TOTAL DA DESPESA</div>
          <div aria-live="polite" style={{ marginTop: 7, color: '#f97316', fontSize: '0.92rem', fontWeight: 900 }}>{formatBRL(total)}</div>
        </div>
      </div>
    </section>
  );
}
