'use client';
import { useState, useEffect, useCallback } from 'react';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { confirmDialog } from '@/components/ui/confirm-dialog';

interface Adiantamento {
  id: string;
  description: string;
  value: number;
  recipient: string;
  unit: string;
  status: 'pendente' | 'finalizado';
  isRecurring: boolean;
  notes: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', backdropFilter: 'blur(20px)', borderRadius: 20,
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: 24,
};
const inputS: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid var(--border)',
  outline: 'none', fontSize: '0.88rem', background: 'var(--bg)', boxSizing: 'border-box' as const,
  color: 'var(--text-main)', fontFamily: 'inherit', transition: 'border-color 0.2s, box-shadow 0.2s',
};
const labelS: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700,
  color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.3px',
};
const thS: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontWeight: 800, color: 'var(--text-muted)',
  fontSize: '0.72rem', textTransform: 'uppercase',
};



function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  const val = parseInt(digits, 10) / 100;
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyInput(s: string): number {
  const d = s.replace(/[^\d]/g, '');
  return parseFloat(d) / 100 || 0;
}

function valueToCurrencyDisplay(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AdiantamentoSection({ selectedUnit = 'all' }: { selectedUnit?: string }) {
  const { units: UNITS } = useGlobalUnit();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('virtuosa_adiantamento_collapsed') === 'true';
    return false;
  });
  const [items, setItems] = useState<Adiantamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pendente' | 'finalizado'>('all');

  // Form state
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [recipient, setRecipient] = useState('');
  const [unit, setUnit] = useState(selectedUnit !== 'all' ? selectedUnit : 'Barueri');
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit modal state
  const [editItem, setEditItem] = useState<Adiantamento | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [editUnit, setEditUnit] = useState('Barueri');
  const [editNotes, setEditNotes] = useState('');
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/adiantamento');
      const data = await res.json();
      if (res.ok) setItems(data.items || []);
    } catch (err) { console.error('Fetch error:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('virtuosa_adiantamento_collapsed', String(next));
      return next;
    });
  };

  const handleAdd = async () => {
    const val = parseCurrencyInput(value);
    if (!description.trim() || val <= 0 || !recipient.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/adiantamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), value: val, recipient: recipient.trim(), unit, notes: notes.trim() || null, isRecurring }),
      });
      if (res.ok) {
        setDescription(''); setValue(''); setRecipient(''); setNotes(''); setIsRecurring(false);
        fetchItems();
      }
    } catch (err) { console.error('Add error:', err); }
    setSaving(false);
  };

  const openEdit = (item: Adiantamento) => {
    setEditItem(item);
    setEditDescription(item.description);
    setEditValue(valueToCurrencyDisplay(item.value));
    setEditRecipient(item.recipient);
    setEditUnit(item.unit);
    setEditNotes(item.notes || '');
    setEditIsRecurring(item.isRecurring);
  };

  const handleEdit = async () => {
    if (!editItem) return;
    const val = parseCurrencyInput(editValue);
    if (!editDescription.trim() || val <= 0 || !editRecipient.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/adiantamento', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editItem.id, description: editDescription.trim(), value: val,
          recipient: editRecipient.trim(), unit: editUnit,
          notes: editNotes.trim() || null, isRecurring: editIsRecurring,
        }),
      });
      if (res.ok) { setEditItem(null); fetchItems(); }
    } catch (err) { console.error('Edit error:', err); }
    setEditSaving(false);
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pendente' ? 'finalizado' : 'pendente';
    try {
      const res = await fetch('/api/adiantamento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) fetchItems();
    } catch (err) { console.error('Toggle error:', err); }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Remover Adiantamento', message: 'Remover este adiantamento?', confirmText: 'Sim, remover', variant: 'danger' })) return;
    try {
      const res = await fetch(`/api/adiantamento?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchItems();
    } catch (err) { console.error('Delete error:', err); }
  };

  // Filter by selected unit first
  const unitItems = selectedUnit === 'all' ? items : items.filter(i => i.unit === selectedUnit);
  const filteredItems = filter === 'all' ? unitItems : unitItems.filter(i => i.status === filter);
  const totalPendente = unitItems.filter(i => i.status === 'pendente').reduce((s, i) => s + i.value, 0);
  const totalFinalizado = unitItems.filter(i => i.status === 'finalizado').reduce((s, i) => s + i.value, 0);
  const totalGeral = unitItems.reduce((s, i) => s + i.value, 0);

  const filterBtnS = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 10, border: '1px solid var(--border)',
    background: active ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
  });

  const toggleStyle = (on: boolean): React.CSSProperties => ({
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: on ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--border)',
    position: 'relative', transition: 'background 0.3s', flexShrink: 0,
  });

  const toggleKnob = (on: boolean): React.CSSProperties => ({
    width: 18, height: 18, borderRadius: 9, background: '#fff',
    position: 'absolute', top: 3, left: on ? 23 : 3,
    transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  return (
    <section style={{ marginTop: 16 }}>
      {/* Header — collapsible */}
      <div onClick={toggleCollapsed} style={{ ...cardS, padding: '13px 16px', marginBottom: collapsed ? 0 : 14, cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <span className="material-symbols-outlined" style={{ color: '#6366f1', fontSize: 20, flexShrink: 0 }}>payments</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Adiantamentos</span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {unitItems.length > 0 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '3px 10px', borderRadius: 16, whiteSpace: 'nowrap' }}>
              {unitItems.filter(i => i.status === 'pendente').length}p • {formatBRL(totalPendente)}
            </span>
          )}
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)', transition: 'transform 0.3s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', flexShrink: 0 }}>expand_more</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: collapsed ? 0 : 8000, opacity: collapsed ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.4s ease, opacity 0.3s ease' }}>

        {/* Summary Cards — mantém 3 colunas mas compactas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          <div style={{ ...cardS, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 3 }}>Total Geral</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#6366f1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatBRL(totalGeral)}</div>
          </div>
          <div style={{ ...cardS, padding: '12px 10px', textAlign: 'center', border: '1px solid rgba(245,158,11,0.15)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 3 }}>Pendentes</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#f59e0b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatBRL(totalPendente)}</div>
          </div>
          <div style={{ ...cardS, padding: '12px 10px', textAlign: 'center', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 3 }}>Finalizados</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#10b981', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatBRL(totalFinalizado)}</div>
          </div>
        </div>

        {/* Form — mobile-first */}
        <div style={{ ...cardS, marginBottom: 14, padding: '14px 14px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="material-symbols-outlined" style={{ color: '#6366f1', fontSize: 17 }}>add_circle</span>
            Novo Adiantamento
          </h3>
          {/* Row 1: Beneficiário + Descrição */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>person</span> Beneficiário</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Nome do colaborador" style={inputS} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>description</span> Descrição</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Adiantamento salarial" style={inputS} />
            </div>
          </div>
          {/* Row 2: Valor + Unidade */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>attach_money</span> Valor (R$)</label>
              <input value={value} onChange={e => setValue(formatCurrencyInput(e.target.value))} placeholder="0,00" inputMode="numeric" style={inputS} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>location_on</span> Unidade</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>notes</span> Observação</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" style={inputS} />
            </div>
          </div>
          {/* Row 3: Toggle fixo + botão Adicionar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setIsRecurring(!isRecurring)} style={toggleStyle(isRecurring)} type="button">
                <div style={toggleKnob(isRecurring)} />
              </button>
              <label style={{ ...labelS, marginBottom: 0, cursor: 'pointer' }} onClick={() => setIsRecurring(!isRecurring)}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>repeat</span>
                Fixo mensal
              </label>
            </div>
            <button onClick={handleAdd} disabled={saving || !description.trim() || !recipient.trim() || parseCurrencyInput(value) <= 0} style={{
              padding: '0 18px', height: 44, borderRadius: 11, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', flexShrink: 0,
              opacity: saving || !description.trim() || !recipient.trim() || parseCurrencyInput(value) <= 0 ? 0.5 : 1,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} style={filterBtnS(filter === 'all')}>
            Todos ({unitItems.length})
          </button>
          <button onClick={() => setFilter('pendente')} style={filterBtnS(filter === 'pendente')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#f59e0b', display: 'inline-block' }} />
              Pendentes ({unitItems.filter(i => i.status === 'pendente').length})
            </span>
          </button>
          <button onClick={() => setFilter('finalizado')} style={filterBtnS(filter === 'finalizado')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#10b981', display: 'inline-block' }} />
              Finalizados ({unitItems.filter(i => i.status === 'finalizado').length})
            </span>
          </button>
        </div>

        {/* Table */}
        <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined spinning" style={{ fontSize: 24, color: '#6366f1' }}>progress_activity</span>
              <p style={{ marginTop: 8, fontSize: '0.85rem' }}>Carregando...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-muted)', opacity: 0.3 }}>payments</span>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
                {filter !== 'all' ? 'Nenhum adiantamento com esse status.' : 'Nenhum adiantamento registrado.'}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={thS}>Status</th>
                    <th style={thS}>Beneficiário</th>
                    <th style={thS}>Descrição</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Valor</th>
                    <th style={{ ...thS, textAlign: 'center' }}>Tipo</th>
                    <th style={{ ...thS, textAlign: 'center' }}>Unidade</th>
                    <th style={thS}>Data</th>
                    <th style={{ ...thS, textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const isPendente = item.status === 'pendente';
                    return (
                      <tr key={item.id} style={{
                        borderBottom: '1px solid var(--border)',
                        background: isPendente ? 'transparent' : 'rgba(16,185,129,0.03)',
                        opacity: isPendente ? 1 : 0.75,
                        transition: 'all 0.2s',
                      }}>
                        {/* Status */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
                            background: isPendente ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                            color: isPendente ? '#f59e0b' : '#10b981',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              {isPendente ? 'schedule' : 'check_circle'}
                            </span>
                            {isPendente ? 'Pendente' : 'Finalizado'}
                          </span>
                        </td>
                        {/* Recipient */}
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.recipient}</td>
                        {/* Description */}
                        <td style={{ padding: '12px 16px' }}>
                          <div>{item.description}</div>
                          {item.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.notes}</div>}
                        </td>
                        {/* Value */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: isPendente ? '#f59e0b' : '#10b981' }}>
                          {formatBRL(item.value)}
                        </td>
                        {/* Type (Fixo/Avulso) */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                            background: item.isRecurring ? 'rgba(99,102,241,0.1)' : 'rgba(107,114,128,0.08)',
                            color: item.isRecurring ? '#6366f1' : 'var(--text-muted)',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                              {item.isRecurring ? 'repeat' : 'looks_one'}
                            </span>
                            {item.isRecurring ? 'Fixo' : 'Avulso'}
                          </span>
                        </td>
                        {/* Unit */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ background: 'rgba(99,102,241,0.08)', padding: '2px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600 }}>{item.unit}</span>
                        </td>
                        {/* Date */}
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                          {item.finalizedAt && (
                            <div style={{ fontSize: '0.68rem', color: '#10b981', marginTop: 2 }}>
                              ✓ {new Date(item.finalizedAt).toLocaleDateString('pt-BR')}
                            </div>
                          )}
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {/* Edit button (only for pending) */}
                            {isPendente && (
                              <button onClick={() => openEdit(item)} title="Editar" style={{
                                padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)',
                                background: 'rgba(99,102,241,0.05)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#6366f1' }}>edit</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleStatus(item.id, item.status)}
                              title={isPendente ? 'Finalizar' : 'Reabrir'}
                              style={{
                                padding: '6px 14px', borderRadius: 8, border: 'none',
                                background: isPendente ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(245,158,11,0.1)',
                                color: isPendente ? '#fff' : '#f59e0b',
                                fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s',
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                {isPendente ? 'check' : 'undo'}
                              </span>
                              {isPendente ? 'Finalizar' : 'Reabrir'}
                            </button>
                            <button onClick={() => handleDelete(item.id)} title="Remover" style={{
                              padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                              background: 'rgba(239,68,68,0.05)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setEditItem(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
          <div style={{ ...cardS, position: 'relative', width: '100%', maxWidth: 520, padding: 28, animation: 'fadeIn 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: '#6366f1', fontSize: 20 }}>edit</span>
                Editar Adiantamento
              </h3>
              <button onClick={() => setEditItem(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>person</span> Beneficiário</label>
                <input value={editRecipient} onChange={e => setEditRecipient(e.target.value)} style={inputS} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span> Descrição</label>
                  <input value={editDescription} onChange={e => setEditDescription(e.target.value)} style={inputS} />
                </div>
                <div>
                  <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>attach_money</span> Valor (R$)</label>
                  <input value={editValue} onChange={e => setEditValue(formatCurrencyInput(e.target.value))} style={inputS} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span> Unidade</label>
                  <select value={editUnit} onChange={e => setEditUnit(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>notes</span> Observação</label>
                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Opcional" style={inputS} />
                </div>
              </div>

              {/* Recurring toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: editIsRecurring ? 'rgba(99,102,241,0.06)' : 'var(--bg)', border: `1px solid ${editIsRecurring ? 'rgba(99,102,241,0.2)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                <button onClick={() => setEditIsRecurring(!editIsRecurring)} style={toggleStyle(editIsRecurring)} type="button">
                  <div style={toggleKnob(editIsRecurring)} />
                </button>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: editIsRecurring ? '#6366f1' : 'var(--text-main)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'text-bottom', marginRight: 4 }}>repeat</span>
                    Valor fixo mensal
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {editIsRecurring ? 'Este adiantamento se repete todos os meses' : 'Este adiantamento é avulso (uma vez)'}
                  </div>
                </div>
              </div>

              {/* Save button */}
              <button onClick={handleEdit} disabled={editSaving || !editDescription.trim() || !editRecipient.trim() || parseCurrencyInput(editValue) <= 0} style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: editSaving || !editDescription.trim() || !editRecipient.trim() || parseCurrencyInput(editValue) <= 0 ? 0.5 : 1,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                {editSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </section>
  );
}
