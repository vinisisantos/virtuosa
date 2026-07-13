'use client';

import { useMemo, useState } from 'react';
import { CategorySelector } from '@/components/category-selector';
import { DatePicker } from '@/components/ui/date-picker';
import {
  formatCurrency,
  fmt,
  LogEntry,
  ManualRevenueDraft,
  RevenueStatus,
  UNITS,
} from '@/hooks/useDashboard';
import { isManualRevenue } from '@/lib/revenue';

const DEFAULT_CATEGORIES = ['Serviços', 'Produtos', 'Reembolsos', 'Rendimentos', 'Outras receitas'];
const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Boleto', 'Outro'];

type RevenueFilter = 'all' | RevenueStatus;

function dateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatDate(value: string) {
  const key = dateKey(value);
  return key ? key.split('-').reverse().join('/') : '—';
}

function isInSelectedPeriod(entry: LogEntry, month: number, year: number, unit: string) {
  const date = new Date(entry.date);
  return !Number.isNaN(date.getTime())
    && date.getUTCMonth() === month
    && date.getUTCFullYear() === year
    && (unit === 'all' || (entry.unit || '') === unit);
}

export function RevenueView({ d }: { d: any }) {
  const [filter, setFilter] = useState<RevenueFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('Serviços');
  const [payment, setPayment] = useState('Pix');
  const [status, setStatus] = useState<RevenueStatus>('pending');
  const [notes, setNotes] = useState('');
  const [unit, setUnit] = useState(d.selectedUnit === 'all' ? d.saleUnit || UNITS[0] : d.selectedUnit);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const revenues = useMemo(() => d.logs
    .filter((entry: LogEntry) => isManualRevenue(entry))
    .filter((entry: LogEntry) => isInSelectedPeriod(entry, d.selectedMonth, d.selectedYear, d.selectedUnit))
    .sort((a: LogEntry, b: LogEntry) => b.date.localeCompare(a.date)), [d.logs, d.selectedMonth, d.selectedUnit, d.selectedYear]);

  const visibleRevenues = filter === 'all'
    ? revenues
    : revenues.filter((entry: LogEntry) => (entry.status || 'pending') === filter);
  const pendingTotal = revenues.filter((entry: LogEntry) => (entry.status || 'pending') === 'pending').reduce((sum: number, entry: LogEntry) => sum + entry.value, 0);
  const receivedTotal = revenues.filter((entry: LogEntry) => entry.status === 'received').reduce((sum: number, entry: LogEntry) => sum + entry.value, 0);
  const total = pendingTotal + receivedTotal;

  const categories = useMemo(() => Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...revenues.map((entry: LogEntry) => entry.category).filter((item: string | undefined): item is string => Boolean(item)),
    ...customCategories,
  ])), [customCategories, revenues]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setValue('');
    setDate('');
    setCategory('Serviços');
    setPayment('Pix');
    setStatus('pending');
    setNotes('');
    setUnit(d.selectedUnit === 'all' ? d.saleUnit || UNITS[0] : d.selectedUnit);
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (entry: LogEntry) => {
    setEditing(entry);
    setName(entry.name);
    setValue(formatCurrency(String(Math.round(entry.value * 100))));
    setDate(dateKey(entry.date));
    setCategory(entry.category || 'Outras receitas');
    setPayment(entry.payment || 'Pix');
    setStatus(entry.status || 'pending');
    setNotes(entry.obs || '');
    setUnit(entry.unit || (d.selectedUnit === 'all' ? d.saleUnit || UNITS[0] : d.selectedUnit));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const save = () => {
    const draft: ManualRevenueDraft = { name, value, date, category, payment, obs: notes, unit, status };
    const saved = editing?.id
      ? d.updateManualRevenue(editing.id, draft)
      : d.addManualRevenue(draft);
    if (saved) closeForm();
  };

  const remove = (entry: LogEntry) => {
    if (entry.id && confirm(`Deseja excluir a receita “${entry.name}”?`)) d.deleteManualRevenue(entry.id);
  };

  const sourceUnits: string[] = d.allowedUnits?.length ? d.allowedUnits : UNITS;
  const availableUnits: string[] = Array.from(new Set(sourceUnits.filter(item => item !== 'all')));

  return (
    <div style={{ animation: 'fadeSlide 0.25s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 12, padding: '10px 18px', background: 'var(--primary)', color: '#fff', fontWeight: 750, cursor: 'pointer', boxShadow: '0 4px 14px rgba(230,0,126,0.2)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 19 }}>add</span>
          Nova Receita
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'A RECEBER', value: pendingTotal, icon: 'pending_actions', color: '#f59e0b' },
          { label: 'RECEBIDO', value: receivedTotal, icon: 'task_alt', color: '#22c55e' },
          { label: 'TOTAL LANÇADO', value: total, icon: 'account_balance_wallet', color: '#8b5cf6' },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${card.color} 12%, transparent)` }}>
              <span className="material-symbols-outlined" style={{ color: card.color, fontSize: 23 }}>{card.icon}</span>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 750 }}>{card.label}</div>
              <div style={{ marginTop: 4, color: 'var(--text-main)', fontSize: '1.45rem', fontWeight: 900 }}>{fmt(card.value)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'inline-flex', padding: 4, marginBottom: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
        {(['all', 'pending', 'received'] as RevenueFilter[]).map(option => (
          <button key={option} onClick={() => setFilter(option)} style={{ border: 'none', borderRadius: 7, padding: '7px 13px', background: filter === option ? 'var(--card-bg)' : 'transparent', color: filter === option ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: filter === option ? 750 : 550, cursor: 'pointer' }}>
            {option === 'all' ? 'Todas' : option === 'pending' ? 'A receber' : 'Recebidas'}
          </button>
        ))}
      </div>

      <div style={{ overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card-bg)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '0.76rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '15px 18px' }}>Receita</th>
                <th style={{ padding: '15px 18px' }}>Data</th>
                <th style={{ padding: '15px 18px' }}>Valor</th>
                <th style={{ padding: '15px 18px' }}>Status</th>
                <th style={{ padding: '15px 18px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRevenues.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ display: 'block', fontSize: 38, opacity: 0.5, marginBottom: 8 }}>payments</span>
                  Nenhuma receita encontrada neste período.
                </td></tr>
              ) : visibleRevenues.map((entry: LogEntry) => {
                const isReceived = entry.status === 'received';
                return (
                  <tr key={entry.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '15px 18px' }}>
                      <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>{entry.name}</div>
                      <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{entry.category || 'Outras receitas'}{entry.payment ? ` · ${entry.payment}` : ''}{d.selectedUnit === 'all' && entry.unit ? ` · ${entry.unit}` : ''}</div>
                    </td>
                    <td style={{ padding: '15px 18px', color: 'var(--text-muted)' }}>{formatDate(entry.date)}</td>
                    <td style={{ padding: '15px 18px', color: 'var(--text-main)', fontWeight: 800 }}>{fmt(entry.value)}</td>
                    <td style={{ padding: '15px 18px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 7, color: isReceived ? '#22c55e' : '#f59e0b', background: isReceived ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', fontSize: '0.78rem', fontWeight: 750 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{isReceived ? 'check_circle' : 'schedule'}</span>
                        {isReceived ? 'Recebida' : 'A receber'}
                      </span>
                    </td>
                    <td style={{ padding: '15px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
                        {entry.id && <button onClick={() => d.setManualRevenueStatus(entry.id, isReceived ? 'pending' : 'received')} title={isReceived ? 'Marcar como pendente' : 'Marcar como recebida'} style={{ width: 32, height: 32, border: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', background: isReceived ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', color: isReceived ? '#f59e0b' : '#22c55e', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>{isReceived ? 'undo' : 'done'}</span></button>}
                        <button onClick={() => openEdit(entry)} title="Editar receita" style={{ width: 32, height: 32, border: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(139,92,246,0.1)', color: 'var(--primary)', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span></button>
                        <button onClick={() => remove(entry)} title="Excluir receita" style={{ width: 32, height: 32, border: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div onMouseDown={event => event.target === event.currentTarget && closeForm()} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 18, padding: 28, background: 'var(--card-bg)', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <h2 style={{ margin: '0 0 22px', display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-main)', fontSize: '1.35rem' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>{editing ? 'edit' : 'add_circle'}</span>
              {editing ? 'Editar Receita' : 'Nova Receita'}
            </h2>
            <div style={{ display: 'grid', gap: 15 }}>
              <label style={{ display: 'grid', gap: 6, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Descrição
                <input value={name} onChange={event => setName(event.target.value)} placeholder="Ex: Serviço particular, venda de produto..." style={{ width: '100%', padding: '12px 13px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Valor
                  <input value={value} onChange={event => setValue(formatCurrency(event.target.value))} placeholder="R$ 0,00" style={{ width: '100%', padding: '12px 13px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', fontWeight: 750 }} />
                </label>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Data</label>
                  <DatePicker value={date} onChange={setDate} variant="input" calendarSize="small" placeholder="DD/MM/AAAA" inputStyle={{ height: 45, borderRadius: 10 }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Categoria</label>
                <CategorySelector value={category} onChange={setCategory} categories={categories} onCreateCategory={newCategory => setCustomCategories(current => current.includes(newCategory) ? current : [...current, newCategory])} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: d.selectedUnit === 'all' ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Forma de recebimento
                  <select value={payment} onChange={event => setPayment(event.target.value)} style={{ width: '100%', padding: '12px 13px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit' }}>{PAYMENT_METHODS.map(method => <option key={method}>{method}</option>)}</select>
                </label>
                {d.selectedUnit === 'all' && <label style={{ display: 'grid', gap: 6, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Unidade
                  <select value={unit} onChange={event => setUnit(event.target.value)} style={{ width: '100%', padding: '12px 13px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit' }}>{availableUnits.map(option => <option key={option}>{option}</option>)}</select>
                </label>}
              </div>
              <div>
                <div style={{ marginBottom: 7, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Status</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, padding: 5, border: '1px solid var(--border)', borderRadius: 11, background: 'var(--bg)' }}>
                  {([{ value: 'pending', label: 'A receber', icon: 'schedule' }, { value: 'received', label: 'Recebida', icon: 'check_circle' }] as const).map(option => <button key={option.value} type="button" onClick={() => setStatus(option.value)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '9px 10px', border: 'none', borderRadius: 8, background: status === option.value ? 'var(--card-bg)' : 'transparent', color: status === option.value ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: 17 }}>{option.icon}</span>{option.label}</button>)}
                </div>
              </div>
              <label style={{ display: 'grid', gap: 6, color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 650 }}>Observações
                <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} style={{ width: '100%', resize: 'vertical', padding: '12px 13px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.6fr) minmax(160px, 1fr)', gap: 10, marginTop: 22 }}>
              <button onClick={closeForm} style={{ border: '1px solid var(--border)', borderRadius: 11, padding: 12, background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 750, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={save} style={{ border: 'none', borderRadius: 11, padding: 12, background: 'var(--primary)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{editing ? 'Salvar alterações' : 'Adicionar receita'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
