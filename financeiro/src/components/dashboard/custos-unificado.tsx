'use client';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FixedExpense, Bill, fmt, FIXED_CATEGORIES, BILL_CATEGORIES, MONTHS, formatCurrency, inputS } from '@/hooks/useDashboard';
import { DatePicker } from '@/components/ui/date-picker';
import { CategorySelector } from '@/components/category-selector';

/* ─── Types ─── */
interface PayrollEntry {
  id: string;
  employeeName: string;
  netSalary: number;
  baseSalary: number | null;
  cargo: string | null;
  bonus: number;
  paymentStatus: string;
  extractionSource: string;
  hasPenalty: boolean;
  hasAdiantamento: boolean;
  isRecurring: boolean;
}

/* ─── Constants ─── */
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* ─── Helpers ─── */
const getSelectionKey = (month: number, year: number, unit: string) =>
  `virtuosa_payroll_cost_sel_${month}_${year}_${unit}`;

const loadSelection = (month: number, year: number, unit: string): string[] => {
  try {
    const raw = localStorage.getItem(getSelectionKey(month, year, unit));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveSelection = (month: number, year: number, unit: string, ids: string[]) => {
  localStorage.setItem(getSelectionKey(month, year, unit), JSON.stringify(ids));
};

/* ═══════════════════════════════════════════ */
/* ─── MAIN COMPONENT ─── */
/* ═══════════════════════════════════════════ */
export function CustosUnificado({ d }: { d: any }) {
  const selectedUnit = d.selectedUnit || 'all';

  /* ─── Payroll state ─── */
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [payrollOpen, setPayrollOpen] = useState(false);

  /* ─── UI state ─── */
  const [filterStatus, setFilterStatus] = useState<'all' | 'pago' | 'pendente'>('all');
  const [filterType, setFilterType] = useState<'all' | 'fixo' | 'variavel' | 'folha'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<'fixo' | 'variavel'>('fixo');
  const [addName, setAddName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addCategory, setAddCategory] = useState('Outros');
  const [addDueDay, setAddDueDay] = useState('');
  const [addDueDate, setAddDueDate] = useState('');

  /* ─── Edit modal ─── */
  const [editItem, setEditItem] = useState<any>(null);
  const [editSource, setEditSource] = useState<'fixed' | 'bill'>('fixed');
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editCategory, setEditCategory] = useState('');

  /* ─── Fetch payroll from API ─── */
  const fetchPayroll = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const month = d.selectedMonth + 1;
      const year = d.selectedYear;
      const unitParam = selectedUnit !== 'all' ? `&unit=${selectedUnit}` : '';
      const res = await fetch(`/api/payroll/entries?month=${month}&year=${year}${unitParam}`);
      if (res.ok) {
        const data = await res.json();
        setPayrollEntries(data.entries || []);
      }
    } catch { /* ignore */ }
    setPayrollLoading(false);
  }, [d.selectedMonth, d.selectedYear, selectedUnit]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  /* ─── Load saved employee selection ─── */
  useEffect(() => {
    const saved = loadSelection(d.selectedMonth + 1, d.selectedYear, selectedUnit);
    if (saved.length > 0) {
      setSelectedEmployees(new Set(saved));
    } else if (payrollEntries.length > 0) {
      // Default: select all employees
      setSelectedEmployees(new Set(payrollEntries.map(e => e.id)));
    }
  }, [payrollEntries, d.selectedMonth, d.selectedYear, selectedUnit]);

  /* ─── Toggle employee selection ─── */
  const toggleEmployee = (id: string) => {
    setSelectedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveSelection(d.selectedMonth + 1, d.selectedYear, selectedUnit, [...next]);
      return next;
    });
  };

  const toggleAllEmployees = () => {
    if (selectedEmployees.size === payrollEntries.length) {
      setSelectedEmployees(new Set());
      saveSelection(d.selectedMonth + 1, d.selectedYear, selectedUnit, []);
    } else {
      const all = new Set(payrollEntries.map(e => e.id));
      setSelectedEmployees(all);
      saveSelection(d.selectedMonth + 1, d.selectedYear, selectedUnit, [...all]);
    }
  };

  /* ─── Calculated totals ─── */
  const filteredFixed = selectedUnit === 'all'
    ? d.fixedExpenses
    : d.fixedExpenses.filter((e: FixedExpense) => (e.unit || '') === selectedUnit);
  const filteredBills = d.bills || [];

  const totalFixed = filteredFixed.reduce((s: number, e: FixedExpense) => s + e.value, 0);
  const totalVariable = filteredBills
    .filter((b: Bill) => b.type === 'variavel')
    .reduce((s: number, b: Bill) => s + b.value, 0);
  const totalBillsFixed = filteredBills
    .filter((b: Bill) => b.type === 'fixo')
    .reduce((s: number, b: Bill) => s + b.value, 0);
  const allFixedTotal = totalFixed + totalBillsFixed;

  const getEffectiveSalary = (e: PayrollEntry) =>
    e.hasPenalty ? e.netSalary * 1.1 : e.netSalary;

  const folhaTotal = useMemo(() =>
    payrollEntries
      .filter(e => selectedEmployees.has(e.id))
      .reduce((s, e) => s + getEffectiveSalary(e), 0),
    [payrollEntries, selectedEmployees]
  );

  const totalGeral = allFixedTotal + totalVariable + folhaTotal;

  /* ─── Merged cost list ─── */
  type CostRow = {
    id: number;
    name: string;
    value: number;
    type: 'fixo' | 'variavel';
    category: string;
    dueInfo: string;
    isPaid: boolean;
    source: 'fixed' | 'bill';
    raw: any;
  };

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
    if (!addName.trim() || val <= 0) return;

    if (addType === 'fixo') {
      // Add as fixed expense (recurs every month)
      d.setFixedName(addName.trim());
      d.setFixedValue(addValue);
      d.setFixedCategory(addCategory);
      d.setFixedDate(addDueDate || '');
      setTimeout(() => d.addFixed(), 50);
    } else {
      // Add as variable bill
      d.setBillName(addName.trim());
      d.setBillValue(addValue);
      d.setBillCategory(addCategory);
      d.setBillType('variavel');
      d.setBillDueDate(addDueDate);
      setTimeout(() => d.addBill(), 50);
    }

    setAddName(''); setAddValue(''); setAddCategory('Outros');
    setAddDueDay(''); setAddDueDate(''); setShowAddForm(false);
  };

  /* ─── Edit handlers ─── */
  const startEdit = (row: CostRow) => {
    setEditItem(row.raw);
    setEditSource(row.source);
    setEditName(row.name);
    setEditValue(row.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setEditCategory(row.category);
  };

  const saveEdit = () => {
    if (!editItem) return;
    const digits = editValue.replace(/[^\d]/g, '');
    const val = parseInt(digits, 10) / 100 || 0;
    if (editSource === 'fixed') {
      d.editFixed(editItem.id, { name: editName.trim(), value: val, category: editCategory });
    }
    setEditItem(null);
  };

  /* ─── Delete handler ─── */
  const handleDelete = (row: CostRow) => {
    if (row.source === 'fixed') d.deleteFixed(row.id);
    else d.deleteBill(row.id);
  };

  return (
    <div>
      {/* ─── Period Selector ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <PeriodSelector
          selectedMonth={d.selectedMonth} setSelectedMonth={d.setSelectedMonth}
          selectedYear={d.selectedYear} setSelectedYear={d.setSelectedYear}
        />
      </div>

      {/* ═══ 4 KPI CARDS ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Custos Fixos', value: allFixedTotal, icon: 'repeat', color: '#8b5cf6', sub: `${filteredFixed.length + filteredBills.filter((b:Bill)=>b.type==='fixo').length} itens` },
          { label: 'Custos Variáveis', value: totalVariable, icon: 'event', color: '#f59e0b', sub: `${filteredBills.filter((b:Bill)=>b.type==='variavel').length} itens` },
          { label: 'Folha de Pagamento', value: folhaTotal, icon: 'payments', color: '#6366f1', sub: `${selectedEmployees.size}/${payrollEntries.length} colab.` },
          { label: 'Total Geral', value: totalGeral, icon: 'account_balance_wallet', color: '#ef4444', sub: 'Fixos + Variáveis + Folha' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--card-bg)', borderRadius: 16, padding: '20px 22px',
            border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 25px ${kpi.color}15`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${kpi.color}, ${kpi.color}60)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, marginTop: 4 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${kpi.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1, marginBottom: 6 }}>{fmt(kpi.value)}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ FILTERS + ADD BUTTON ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 20, flexWrap: 'wrap',
      }}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* Status filter */}
          {(['all', 'pendente', 'pago'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid',
              borderColor: filterStatus === s ? '#10b981' : 'var(--border)',
              background: filterStatus === s ? '#10b98115' : 'var(--card-bg)',
              color: filterStatus === s ? '#10b981' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {s === 'all' ? 'Todos' : s === 'pago' ? '✅ Pago' : '🕐 Pendente'}
            </button>
          ))}
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
          {/* Type filter */}
          {(['all', 'fixo', 'variavel'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid',
              borderColor: filterType === t ? '#8b5cf6' : 'var(--border)',
              background: filterType === t ? '#8b5cf615' : 'var(--card-bg)',
              color: filterType === t ? '#8b5cf6' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {t === 'all' ? 'Todos' : t === 'fixo' ? '🔄 Fixo' : '📅 Variável'}
            </button>
          ))}
        </div>

        {/* Add button */}
        <button onClick={() => setShowAddForm(!showAddForm)} style={{
          padding: '8px 18px', borderRadius: 10, border: 'none',
          background: showAddForm ? 'var(--border)' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
          color: showAddForm ? 'var(--text-muted)' : '#fff',
          fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'all 0.2s',
          boxShadow: showAddForm ? 'none' : '0 4px 12px rgba(230,0,126,0.25)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {showAddForm ? 'close' : 'add'}
          </span>
          {showAddForm ? 'Cancelar' : 'Adicionar Custo'}
        </button>
      </div>

      {/* ═══ ADD FORM ═══ */}
      {showAddForm && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: 16, padding: '20px 22px',
          border: '1px solid var(--border)', marginBottom: 20,
          animation: 'fadeSlide 0.25s ease-out',
        }}>
          {/* Type toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--bg)', borderRadius: 10, padding: 3 }}>
            {(['fixo', 'variavel'] as const).map(t => (
              <button key={t} onClick={() => setAddType(t)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                background: addType === t ? (t === 'fixo' ? '#8b5cf6' : '#f59e0b') : 'transparent',
                color: addType === t ? '#fff' : 'var(--text-muted)',
                fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {t === 'fixo' ? 'repeat' : 'event'}
                </span>
                {t === 'fixo' ? 'Custo Fixo' : 'Custo Variável'}
              </button>
            ))}
          </div>

          {/* Hint */}
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: addType === 'fixo' ? '#8b5cf608' : '#f59e0b08',
            border: `1px solid ${addType === 'fixo' ? '#8b5cf620' : '#f59e0b20'}`,
            fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: addType === 'fixo' ? '#8b5cf6' : '#f59e0b' }}>info</span>
            {addType === 'fixo'
              ? 'Custos fixos se repetem automaticamente todos os meses até serem excluídos.'
              : 'Custos variáveis entram apenas no mês da data de vencimento informada.'}
          </div>

          {/* Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nome do Custo</label>
              <input value={addName} onChange={e => setAddName(e.target.value)}
                placeholder="Ex: Aluguel, Energia..."
                style={{ ...inputS, padding: '10px 14px', fontSize: '0.85rem', height: 'auto' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valor (R$)</label>
              <input value={addValue} onChange={e => setAddValue(formatCurrency(e.target.value))}
                placeholder="0,00" inputMode="numeric"
                style={{ ...inputS, padding: '10px 14px', fontSize: '0.85rem', height: 'auto' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Categoria</label>
              <CategorySelector value={addCategory} onChange={setAddCategory}
                categories={addType === 'fixo' ? FIXED_CATEGORIES : BILL_CATEGORIES}
                accentColor={addType === 'fixo' ? '#8b5cf6' : '#f59e0b'} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {addType === 'fixo' ? 'Data (opcional)' : 'Data de Vencimento'}
              </label>
              <DatePicker value={addDueDate} onChange={setAddDueDate} variant="input" />
            </div>
          </div>

          {/* Save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={handleAdd} style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: `linear-gradient(135deg, ${addType === 'fixo' ? '#8b5cf6' : '#f59e0b'}, ${addType === 'fixo' ? '#7c3aed' : '#d97706'})`,
              color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: `0 4px 12px ${addType === 'fixo' ? '#8b5cf630' : '#f59e0b30'}`,
              transition: 'all 0.15s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
              Salvar {addType === 'fixo' ? 'Custo Fixo' : 'Custo Variável'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ COST TABLE ═══ */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: 16, padding: 0,
        border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 22px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#14b8a610', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#14b8a6' }}>receipt_long</span>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Custos Cadastrados</h2>
            <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {costRows.length} itens • {fmt(costRows.reduce((s, r) => s + r.value, 0))}
            </p>
          </div>
        </div>

        {costRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--border)', display: 'block', marginBottom: 8 }}>receipt</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Nenhum custo cadastrado</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Nome', 'Tipo', 'Vencimento', 'Status', 'Valor', 'Ações'].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 14px',
                      textAlign: i === 4 ? 'right' : 'left',
                      fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costRows.map((row) => (
                  <tr key={`${row.source}-${row.id}`}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Name */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: row.type === 'fixo' ? '#8b5cf610' : '#f59e0b10',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <span className="material-symbols-outlined" style={{
                            fontSize: 15,
                            color: row.type === 'fixo' ? '#8b5cf6' : '#f59e0b',
                          }}>{row.type === 'fixo' ? 'repeat' : 'event'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{row.name}</span>
                          {row.category && (
                            <div style={{ marginTop: 2 }}>
                              <span style={{
                                background: 'rgba(100,116,139,0.06)', color: '#64748b',
                                padding: '1px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600,
                              }}>{row.category}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        background: row.type === 'fixo' ? '#10b98112' : '#9333ea12',
                        color: row.type === 'fixo' ? '#10b981' : '#9333ea',
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}>
                        {row.type === 'fixo' ? '🔄 Fixo' : '📅 Variável'}
                      </span>
                    </td>
                    {/* Due */}
                    <td style={{ padding: '12px 14px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {row.dueInfo}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      {row.source === 'bill' ? (
                        <span style={{
                          background: row.isPaid ? '#10b98112' : '#f59e0b12',
                          color: row.isPaid ? '#10b981' : '#f59e0b',
                          padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}>
                          {row.isPaid ? '✅ Pago' : '🕐 Pendente'}
                        </span>
                      ) : (
                        <span style={{
                          background: '#6366f110', color: '#6366f1',
                          padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                        }}>Ativo</span>
                      )}
                    </td>
                    {/* Value */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#ef4444', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                      {fmt(row.value)}
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '12px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                        {row.source === 'fixed' && (
                          <IconBtn icon="edit" color="#f59e0b" title="Editar" onClick={() => startEdit(row)} />
                        )}
                        {row.source === 'bill' && !row.isPaid && (
                          <IconBtn icon="check_circle" color="#10b981" title="Marcar Pago" onClick={() => d.markPaid(row.id)} />
                        )}
                        <IconBtn icon="delete" color="#ef4444" title="Excluir" onClick={() => handleDelete(row)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ PAYROLL ACCORDION ═══ */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: 16,
        border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden',
      }}>
        {/* Accordion header */}
        <button onClick={() => setPayrollOpen(!payrollOpen)} style={{
          width: '100%', padding: '18px 22px', border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'inherit', transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.02)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#6366f110', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>payments</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Folha de Pagamento</h3>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {selectedEmployees.size} de {payrollEntries.length} colaboradores selecionados • {fmt(folhaTotal)}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              padding: '4px 12px', borderRadius: 8,
              background: '#6366f110', color: '#6366f1',
              fontWeight: 800, fontSize: '0.85rem',
            }}>{fmt(folhaTotal)}</span>
            <span className="material-symbols-outlined" style={{
              fontSize: 20, color: 'var(--text-muted)',
              transition: 'transform 0.3s',
              transform: payrollOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>expand_more</span>
          </div>
        </button>

        {/* Accordion content */}
        {payrollOpen && (
          <div style={{ borderTop: '1px solid var(--border)', animation: 'fadeSlide 0.2s ease-out' }}>
            {payrollLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                <div style={{
                  width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: '#6366f1',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
                }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Carregando folha...</p>
              </div>
            ) : payrollEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--border)', display: 'block', marginBottom: 8 }}>group_off</span>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                  Nenhum colaborador encontrado para este período
                </p>
              </div>
            ) : (
              <>
                {/* Select all */}
                <div style={{
                  padding: '12px 22px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)',
                  }}>
                    <input type="checkbox"
                      checked={selectedEmployees.size === payrollEntries.length}
                      onChange={toggleAllEmployees}
                      style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                    Selecionar todos
                  </label>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {selectedEmployees.size} selecionados
                  </span>
                </div>

                {/* Employee list */}
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {payrollEntries.map((emp) => {
                    const isSelected = selectedEmployees.has(emp.id);
                    const salary = getEffectiveSalary(emp);
                    return (
                      <div key={emp.id}
                        onClick={() => toggleEmployee(emp.id)}
                        style={{
                          padding: '14px 22px', display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
                          cursor: 'pointer', transition: 'background 0.15s',
                          background: isSelected ? '#6366f104' : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(99,102,241,0.02)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#6366f104' : 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <input type="checkbox" checked={isSelected} readOnly
                            style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer', pointerEvents: 'none' }}
                          />
                          <div style={{
                            width: 34, height: 34, borderRadius: 10,
                            background: `hsl(${emp.employeeName.length * 37 % 360}, 60%, 92%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: '0.75rem',
                            color: `hsl(${emp.employeeName.length * 37 % 360}, 60%, 40%)`,
                          }}>
                            {emp.employeeName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>{emp.employeeName}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                              {emp.cargo && (
                                <span style={{
                                  background: '#64748b0a', color: '#64748b',
                                  padding: '1px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600,
                                }}>{emp.cargo}</span>
                              )}
                              <span style={{
                                background: emp.extractionSource === 'manual' ? '#f59e0b0a' : '#10b9810a',
                                color: emp.extractionSource === 'manual' ? '#f59e0b' : '#10b981',
                                padding: '1px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600,
                              }}>
                                {emp.extractionSource === 'manual' ? 'Manual' : 'Importado'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontWeight: 800, fontSize: '0.95rem',
                            color: isSelected ? '#6366f1' : 'var(--text-muted)',
                            transition: 'color 0.2s',
                          }}>{fmt(salary)}</div>
                          {emp.hasAdiantamento && (
                            <div style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>
                              c/ adiantamento
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total footer */}
                <div style={{
                  padding: '14px 22px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', background: '#6366f108',
                }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Total Folha Selecionada
                  </span>
                  <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#6366f1' }}>{fmt(folhaTotal)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ COST BREAKDOWN ═══ */}
      {totalGeral > 0 && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: 16, padding: '20px 22px',
          border: '1px solid var(--border)', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#14b8a610', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#14b8a6' }}>bar_chart</span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Distribuição</h2>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Composição dos custos</p>
            </div>
          </div>

          {[
            { label: 'Custos Fixos', value: allFixedTotal, color: '#8b5cf6' },
            { label: 'Custos Variáveis', value: totalVariable, color: '#f59e0b' },
            { label: 'Folha de Pagamento', value: folhaTotal, color: '#6366f1' },
          ].filter(item => item.value > 0).map((item, i) => {
            const pct = totalGeral > 0 ? (item.value / totalGeral) * 100 : 0;
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{item.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: item.color }}>{fmt(item.value)}</span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                      borderRadius: 6, background: `${item.color}10`, color: item.color,
                    }}>{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: `linear-gradient(90deg, ${item.color}, ${item.color}80)`,
                    width: `${pct}%`, transition: 'width 0.6s ease', minWidth: pct > 0 ? 4 : 0,
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ EDIT MODAL ═══ */}
      {editItem && (
        <div onClick={() => setEditItem(null)} style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card-bg)', borderRadius: 18,
            border: '1px solid var(--border)', maxWidth: 460, width: '100%',
            padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            animation: 'fadeSlide 0.2s ease-out',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: '#f59e0b' }}>edit</span>Editar Custo
              </h2>
              <button onClick={() => setEditItem(null)} style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Descrição</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputS }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Valor (R$)</label>
                <input value={editValue} onChange={e => setEditValue(formatCurrency(e.target.value))} inputMode="numeric" style={{ ...inputS }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Categoria</label>
                <CategorySelector value={editCategory} onChange={setEditCategory} categories={FIXED_CATEGORIES} accentColor="#f59e0b" />
              </div>
            </div>
            <button onClick={saveEdit} style={{
              marginTop: 18, width: '100%', padding: '12px',
              borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              color: '#fff', fontWeight: 800, fontSize: '0.9rem',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>Salvar Alterações
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pickerDrop {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          /* Make KPI cards 2-column on mobile */
        }
      `}</style>
    </div>
  );
}

/* ═══ REUSABLE SUB-COMPONENTS ═══ */

function IconBtn({ icon, color, onClick, title }: { icon: string; color: string; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 30, height: 30, borderRadius: 8, border: `1px solid ${color}25`,
      background: `${color}08`, cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}18`; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}08`; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15, color }}>{icon}</span>
    </button>
  );
}

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: '4px 6px' }}>
        <button onClick={goToPrev} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-main)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        ><span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span></button>

        <button onClick={() => { setPickerYear(selectedYear); setShowPicker(!showPicker); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: showPicker ? 'var(--bg)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.88rem', transition: 'all 0.15s' }}>
          {MONTHS[selectedMonth]} {selectedYear}
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showPicker ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
        </button>

        <button onClick={goToNext} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-main)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        ><span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span></button>

        {!isCurrentMonth && (
          <button onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); }} style={{ height: 30, borderRadius: 8, border: 'none', background: 'var(--primary)', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4, color: '#fff', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'inherit', marginLeft: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>today</span>Hoje
          </button>
        )}
      </div>

      {showPicker && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 300, padding: 16, background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 200, animation: 'pickerDrop 0.15s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => setPickerYear(pickerYear - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>{pickerYear}</span>
            <button onClick={() => setPickerYear(pickerYear + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MONTHS_SHORT.map((label, m) => {
              const isSelected = m === selectedMonth && pickerYear === selectedYear;
              const isCurrent = m === now.getMonth() && pickerYear === now.getFullYear();
              return (
                <button key={m} onClick={() => selectMonth(m)} style={{
                  padding: '8px 4px', borderRadius: 8, border: 'none',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: isSelected || isCurrent ? 700 : 500,
                  fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >{label}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
