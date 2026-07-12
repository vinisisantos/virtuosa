'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { FixedExpense, Bill, fmt, FIXED_CATEGORIES, BILL_CATEGORIES, MONTHS, formatCurrency } from '@/hooks/useDashboard';
import { DatePicker } from '@/components/ui/date-picker';
import { CategorySelector } from '@/components/category-selector';
import { LucratividadeView } from './lucratividade-view';

/* ─── Types ─── */
interface CostRow {
  id: string | number;
  name: string;
  value: number;
  type: 'fixo' | 'variavel';
  category: string;
  dueInfo: string;
  isPaid: boolean;
  source: 'fixed' | 'bill';
  raw: any;
}

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* ═══════════════════════════════════════════ */
/* ─── MAIN COMPONENT ─── */
/* ═══════════════════════════════════════════ */
export function CustosUnificado({ d }: { d: any }) {
  /* ─── UI state ─── */
  const [viewMode, setViewMode] = useState<'pagamentos' | 'lucratividade'>('pagamentos');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pago' | 'pendente'>('all');
  const [filterType, setFilterType] = useState<'all' | 'fixo' | 'variavel'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [addName, setAddName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addCategory, setAddCategory] = useState('Outros');
  const [addDueDate, setAddDueDate] = useState('');
  const [addRefMonth, setAddRefMonth] = useState('');
  const [addObs, setAddObs] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  /* ─── Derived Data ─── */
  const filteredFixed = d.fixedExpenses.filter((e: FixedExpense) => e.value > 0 && (!e.unit || e.unit === d.selectedUnit));
  const filteredBills = d.bills.filter((b: Bill) => !b.unit || b.unit === d.selectedUnit);

  const availableCategories = useMemo(() => {
    const baseCategories = isRecurring ? FIXED_CATEGORIES : BILL_CATEGORIES;
    const savedCategories = [...filteredFixed, ...filteredBills]
      .map(expense => expense.category?.trim())
      .filter((category): category is string => Boolean(category));

    return Array.from(new Set([...baseCategories, ...savedCategories, ...customCategories]));
  }, [customCategories, filteredBills, filteredFixed, isRecurring]);

  const costRows: CostRow[] = useMemo(() => {
    const rows: CostRow[] = [];
    filteredFixed.forEach((e: FixedExpense) => {
      rows.push({
        id: e.id, name: e.name, value: e.value,
        type: 'fixo', category: e.category,
        dueInfo: 'Recorrente',
        isPaid: false, source: 'fixed', raw: e,
      });
    });
    filteredBills.forEach((b: Bill) => {
      const isPaid = d.isBillPaid(b);
      const dueInfo = b.type === 'fixo'
        ? `Dia ${b.dueDay}`
        : (b.dueDateManual ? new Date(b.dueDateManual + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
      rows.push({
        id: b.id, name: b.name, value: b.value,
        type: b.type, category: b.category,
        dueInfo, isPaid, source: 'bill', raw: b,
      });
    });
    return rows.filter(r => {
      if (filterStatus === 'pago' && !r.isPaid) return false;
      if (filterStatus === 'pendente' && r.isPaid) return false;
      if (filterType === 'fixo' && r.type !== 'fixo') return false;
      if (filterType === 'variavel' && r.type !== 'variavel') return false;
      return true;
    }).sort((a, b) => b.value - a.value);
  }, [filteredFixed, filteredBills, filterStatus, filterType, d]);

  /* ─── Add cost handler ─── */
  const handleAdd = () => {
    const digits = addValue.replace(/[^\d]/g, '');
    const val = parseInt(digits, 10) / 100;
    if (!addName.trim() || val <= 0) return alert('Informe nome e valor da despesa.');
    if (!addDueDate) return alert('Informe a data.');

    const saved = isRecurring
      ? d.addFixed({
          name: addName,
          value: addValue,
          category: addCategory,
          date: addDueDate,
          unit: d.fixedUnit,
          obs: addObs,
        })
      : d.addBill({
          name: addName,
          value: addValue,
          type: 'variavel',
          dueDate: addDueDate,
          category: addCategory,
          unit: d.billUnit,
          refMonth: addRefMonth,
          obs: addObs,
        });

    if (!saved) return;

    setAddName(''); setAddValue(''); setAddCategory('Outros');
    setAddDueDate(''); setAddRefMonth(''); setAddObs(''); setIsRecurring(false); setShowAddForm(false);
  };

  const handleCreateCategory = (category: string) => {
    setCustomCategories(current => current.some(item => item.toLocaleLowerCase('pt-BR') === category.toLocaleLowerCase('pt-BR'))
      ? current
      : [...current, category]);
  };

  /* ─── Delete handler ─── */
  const handleDelete = (row: CostRow) => {
    if (confirm(`Deseja excluir ${row.name}?`)) {
      if (row.source === 'fixed') d.deleteFixed(row.id);
      else d.deleteBill(row.id);
    }
  };

  const totalPendente = costRows.filter(r => !r.isPaid).reduce((s, r) => s + r.value, 0);
  const totalPago = costRows.filter(r => r.isPaid).reduce((s, r) => s + r.value, 0);
  const totalDespesas = totalPendente + totalPago;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60, fontFamily: 'Inter, sans-serif' }}>
      
      {/* ─── TOP BAR ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <div>
          <PeriodSelector selectedMonth={d.selectedMonth} setSelectedMonth={d.setSelectedMonth} selectedYear={d.selectedYear} setSelectedYear={d.setSelectedYear} />
        </div>
        
        <div style={{ display: 'flex', background: 'var(--card-bg)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <button onClick={() => setViewMode('pagamentos')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'pagamentos' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'pagamentos' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'pagamentos' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'pagamentos' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Pagamentos</button>
          <button onClick={() => setViewMode('lucratividade')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'lucratividade' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'lucratividade' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'lucratividade' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'lucratividade' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Lucratividade (DRE)</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {viewMode === 'pagamentos' && (
            <button onClick={() => setShowAddForm(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'var(--primary)', color: 'white',
              border: 'none', padding: '10px 20px', borderRadius: 12, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(230, 0, 126, 0.25)', transition: 'transform 0.15s'
            }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
              Nova Despesa
            </button>
          )}
        </div>
      </div>

      {viewMode === 'lucratividade' ? (
        <LucratividadeView d={d} />
      ) : (
        <>
          {/* ─── KPI CARDS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#ef4444' }}>pending_actions</span>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>TOTAL PENDENTE</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{fmt(totalPendente)}</div>
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#22c55e' }}>task_alt</span>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>TOTAL PAGO</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{fmt(totalPago)}</div>
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-muted)' }}>account_balance_wallet</span>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>TOTAL DO MÊS</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{fmt(totalDespesas)}</div>
          </div>
        </div>

      </div>

      {/* ─── FILTERS ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
          {['all', 'pendente', 'pago'].map(opt => (
            <button key={opt} onClick={() => setFilterStatus(opt as any)} style={{
              padding: '6px 14px', border: 'none', background: filterStatus === opt ? 'var(--card-bg)' : 'transparent',
              borderRadius: 8, color: filterStatus === opt ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: filterStatus === opt ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer',
              boxShadow: filterStatus === opt ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s'
            }}>
              {opt === 'all' ? 'Todos os Status' : opt === 'pendente' ? 'Pendentes' : 'Pagos'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
          {['all', 'fixo', 'variavel'].map(opt => (
            <button key={opt} onClick={() => setFilterType(opt as any)} style={{
              padding: '6px 14px', border: 'none', background: filterType === opt ? 'var(--card-bg)' : 'transparent',
              borderRadius: 8, color: filterType === opt ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: filterType === opt ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer',
              boxShadow: filterType === opt ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s'
            }}>
              {opt === 'all' ? 'Todos os Tipos' : opt === 'fixo' ? 'Custos Fixos' : 'Custos Variáveis'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TABLE ─── */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '16px 20px', fontWeight: 700 }}>Despesa</th>
                <th style={{ padding: '16px 20px', fontWeight: 700 }}>Vencimento</th>
                <th style={{ padding: '16px 20px', fontWeight: 700 }}>Valor</th>
                <th style={{ padding: '16px 20px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '16px 20px', fontWeight: 700, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {costRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.5, marginBottom: 8 }}>receipt_long</span>
                    <div>Nenhuma despesa encontrada</div>
                  </td>
                </tr>
              ) : (
                costRows.map(row => (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--border)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{row.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, background: row.type === 'fixo' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(249, 115, 22, 0.1)', color: row.type === 'fixo' ? '#6366f1' : '#f97316', fontWeight: 700 }}>
                          {row.type === 'fixo' ? 'Fixo' : 'Variável'}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.category}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {row.dueInfo}
                    </td>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                      {fmt(row.value)}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      {row.isPaid ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span> Pago
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span> Pendente
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        {row.source === 'bill' && !row.isPaid && (
                          <button onClick={() => d.markBillPaid(row.raw)} title="Marcar como Pago" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>
                          </button>
                        )}
                        {row.source === 'bill' && row.isPaid && (
                          <button onClick={() => d.unmarkBillPaid(row.raw)} title="Desfazer Pagamento" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                          </button>
                        )}
                        <button onClick={() => handleDelete(row)} title="Excluir" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* ─── ADD MODAL ─── */}
      {showAddForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeSlide 0.2s ease-out' }}>
          <div style={{ background: 'var(--card-bg)', width: '100%', maxWidth: 440, borderRadius: 20, padding: 32, border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 24px', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>add_circle</span> Nova Despesa
            </h2>
            
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Nome da Despesa</label>
                <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="Ex: Aluguel, Internet..." style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.95rem', fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Valor</label>
                  <input type="text" value={addValue} onChange={e => setAddValue(formatCurrency(e.target.value))} placeholder="R$ 0,00" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.95rem', fontFamily: 'inherit', fontWeight: 700 }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Vencimento</label>
                  <DatePicker
                    value={addDueDate}
                    onChange={setAddDueDate}
                    variant="input"
                    calendarSize="small"
                    placeholder="DD/MM/AAAA"
                    inputStyle={{ height: 46, borderRadius: 10 }}
                  />
                </div>
              </div>

              {!isRecurring && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Mês de Referência (Opcional, ex: Maio 2024)</label>
                  <input type="month" value={addRefMonth} onChange={e => setAddRefMonth(e.target.value)} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.95rem', fontFamily: 'inherit' }} />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Categoria</label>
                <CategorySelector
                  value={addCategory}
                  onChange={setAddCategory}
                  categories={availableCategories}
                  onCreateCategory={handleCreateCategory}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', marginTop: 4 }} onClick={() => setIsRecurring(!isRecurring)}>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isRecurring ? 'var(--primary)' : 'var(--text-muted)'}`, background: isRecurring ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isRecurring && <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'white' }}>check</span>}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Despesa Fixa Recorrente?</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowAddForm(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={handleAdd} style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(230, 0, 126, 0.2)' }}>
                Adicionar Despesa
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pickerDrop {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ═══ REUSABLE SUB-COMPONENTS ═══ */

/* ─── Period Selector ─── */
function PeriodSelector({ selectedMonth, setSelectedMonth, selectedYear, setSelectedYear }: {
  selectedMonth: number; setSelectedMonth: (m: number) => void;
  selectedYear: number; setSelectedYear: (y: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedYear);
  const pickerRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goToPrev = () => { if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else setSelectedMonth(selectedMonth - 1); };
  const goToNext = () => { if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else setSelectedMonth(selectedMonth + 1); };
  const selectMonth = (m: number) => { setSelectedMonth(m); setSelectedYear(pickerYear); setShowPicker(false); };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} ref={pickerRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: '6px 8px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
        <button onClick={goToPrev} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
        </button>

        <button onClick={() => { setPickerYear(selectedYear); setShowPicker(!showPicker); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)', fontWeight: 800, fontSize: '0.95rem' }}>
          {MONTHS[selectedMonth]} {selectedYear}
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>expand_more</span>
        </button>

        <button onClick={goToNext} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
        </button>

        {!isCurrentMonth && (
          <button onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); }} style={{ height: 28, borderRadius: 6, border: 'none', background: 'var(--primary)', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4, color: '#fff', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'inherit', marginLeft: 4 }}>
            Hoje
          </button>
        )}
      </div>

      {showPicker && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 300, padding: 16, background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 200, animation: 'pickerDrop 0.15s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => setPickerYear(pickerYear - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>{pickerYear}</span>
            <button onClick={() => setPickerYear(pickerYear + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {MONTHS_SHORT.map((label, m) => {
              const isSelected = m === selectedMonth && pickerYear === selectedYear;
              const isCurrent = m === now.getMonth() && pickerYear === now.getFullYear();
              return (
                <button key={m} onClick={() => selectMonth(m)} style={{
                  padding: '10px 4px', borderRadius: 8, border: 'none',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: isSelected || isCurrent ? 700 : 500,
                  fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>{label}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
