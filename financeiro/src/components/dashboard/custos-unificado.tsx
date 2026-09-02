'use client';
import { Fragment, useState, useRef, useEffect, useMemo } from 'react';
import { FixedExpense, Bill, LogEntry, fmt, FIXED_CATEGORIES, BILL_CATEGORIES, MONTHS, formatCurrency } from '@/hooks/useDashboard';
import { DatePicker } from '@/components/ui/date-picker';
import { CategorySelector } from '@/components/category-selector';
import { EditableProductExpenseItem, ProductExpenseItemsEditor } from './product-expense-items-editor';
import { LucratividadeView } from './lucratividade-view';
import { CostCalendar } from './cost-calendar';
import { RevenueView } from './revenue-view';
import { isManualRevenue } from '@/lib/revenue';
import { CostRecurrence, currentMonthStartDateKey, recurringCostOccurrencesInMonth, resolveRecurringCostsInMonth, todayDateKey } from '@/lib/cost-recurrence';
import { isProductExpenseCategory, normalizeProductExpenseItems, sumProductExpenseItems } from '@/lib/product-expense-items';

/* ─── Types ─── */
interface CostRow {
  id: string | number;
  name: string;
  value: number;
  periodTotal: number;
  occurrenceCount: number;
  type: 'fixo' | 'variavel';
  recurrence: CostRecurrence;
  category: string;
  dueInfo: string;
  isPaid: boolean;
  paidPortion: number;
  pendingPortion: number;
  recognizedPortion: number;
  isHistorical: boolean;
  source: 'fixed' | 'bill' | 'automatic-payroll' | 'automatic-products';
  raw: any;
}

interface AutomaticPayrollUnit {
  unit: string;
  salaryTotal: number;
  fgtsTotal: number;
  total: number;
  employeeCount: number;
}

interface AutomaticPayrollCost {
  competenceMonth: number;
  competenceYear: number;
  salaryTotal: number;
  fgtsTotal: number;
  total: number;
  employeeCount: number;
  paidTotal: number;
  pendingTotal: number;
  paidSalaryTotal: number;
  pendingSalaryTotal: number;
  paidFgtsTotal: number;
  pendingFgtsTotal: number;
  units: AutomaticPayrollUnit[];
}

interface AutomaticProductOrder {
  id: string;
  productName: string;
  totalPrice: number;
  costRecognizedAt: string;
  status: string;
  unit: string | null;
}

interface AutomaticCostsResponse {
  payroll: AutomaticPayrollCost | null;
  productOrders: AutomaticProductOrder[];
  productOrdersTotal: number;
}

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function normalizeCategoryLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function editableProductItem(name = '', value = ''): EditableProductExpenseItem {
  return {
    id: `produto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    quantity: '1',
    value,
  };
}

function currencyInputValue(value: number) {
  return formatCurrency(String(Math.round(value * 100)));
}

function currencyInputToNumber(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) / 100 : 0;
}

function storedUserCanAccessOrders() {
  try {
    const user = JSON.parse(localStorage.getItem('virtuosa_user') || '{}');
    const permissions = user.permissions || {};
    return user.role === 'ADMINISTRADOR'
      || permissions.admin === true
      || permissions.pedidos === true;
  } catch {
    return false;
  }
}

function AutomaticCostDetails({ row, canOpenOrders }: { row: CostRow; canOpenOrders: boolean }) {
  if (row.source === 'automatic-payroll') {
    const payroll = row.raw as AutomaticPayrollCost;
    const competenceLabel = `${String(payroll.competenceMonth).padStart(2, '0')}/${payroll.competenceYear}`;

    return (
      <div style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '0.9rem' }}>Composição da folha · {competenceLabel}</div>
            <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.45 }}>
              O valor é lido da Folha de Pagamento e refletido automaticamente no mês seguinte.
            </div>
          </div>
          <span style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(139,92,246,0.12)', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 800 }}>
            {payroll.employeeCount} {payroll.employeeCount === 1 ? 'pessoa' : 'pessoas'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700 }}>SALÁRIOS</div>
            <div style={{ marginTop: 4, color: 'var(--text-main)', fontSize: '1rem', fontWeight: 850 }}>{fmt(payroll.salaryTotal)}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.09)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#b45309', fontSize: '0.7rem', fontWeight: 850 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>account_balance</span>
              FGTS DESTACADO
            </div>
            <div style={{ marginTop: 4, color: '#b45309', fontSize: '1rem', fontWeight: 900 }}>{fmt(payroll.fgtsTotal)}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)' }}>
            <div style={{ color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 800 }}>TOTAL SOMADO AOS CUSTOS</div>
            <div style={{ marginTop: 4, color: 'var(--text-main)', fontSize: '1rem', fontWeight: 900 }}>{fmt(payroll.total)}</div>
            <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700 }}>
              Pago {fmt(payroll.paidTotal)} · Pendente {fmt(payroll.pendingTotal)}
            </div>
          </div>
        </div>

        {payroll.units.length > 1 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {payroll.units.map(unit => (
              <div key={unit.unit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '9px 11px', borderRadius: 9, background: 'var(--card-bg)', border: '1px solid var(--border)', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-main)', fontWeight: 750 }}>{unit.unit} · {unit.employeeCount} {unit.employeeCount === 1 ? 'pessoa' : 'pessoas'}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Salários {fmt(unit.salaryTotal)} · <strong style={{ color: '#b45309' }}>FGTS {fmt(unit.fgtsTotal)}</strong> · Total {fmt(unit.total)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.45 }}>
          Somente leitura em Custos. Qualquer alteração na competência {competenceLabel} é atualizada aqui automaticamente. Como a folha não possui baixa separada de FGTS, o status do encargo acompanha o status de pagamento de cada pessoa.
        </div>
      </div>
    );
  }

  const orders = row.raw as AutomaticProductOrder[];
  return (
    <div style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '0.9rem' }}>Pedidos lançados em Produtos</div>
          <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.45 }}>
            Cada pedido entra no total pela data escolhida em Pedidos.
          </div>
        </div>
        {canOpenOrders && (
          <a href="/pedidos" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', gap: 5, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 800 }}>
            Gerenciar pedidos
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
          </a>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {orders.map(order => (
          <div key={order.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) auto', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 750 }}>{order.productName}</div>
              <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                {order.costRecognizedAt.slice(0, 10).split('-').reverse().join('/')} · {order.unit || 'Sem unidade'} · {order.status}
              </div>
            </div>
            <div style={{ color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 850 }}>{fmt(order.totalPrice)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ */
/* ─── MAIN COMPONENT ─── */
/* ═══════════════════════════════════════════ */
export function CustosUnificado({ d }: { d: any }) {
  /* ─── UI state ─── */
  const [viewMode, setViewMode] = useState<'pagamentos' | 'receitas' | 'calendario' | 'lucratividade'>('pagamentos');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pago' | 'pendente' | 'lancado'>('all');
  const [filterType, setFilterType] = useState<'all' | 'fixo' | 'variavel'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [recurrence, setRecurrence] = useState<CostRecurrence>('once');
  const [editingRow, setEditingRow] = useState<CostRow | null>(null);
  const [addName, setAddName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addCategory, setAddCategory] = useState('Outros');
  const [addDueDate, setAddDueDate] = useState('');
  const [addRefMonth, setAddRefMonth] = useState('');
  const [addObs, setAddObs] = useState('');
  const [productItems, setProductItems] = useState<EditableProductExpenseItem[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [automaticCosts, setAutomaticCosts] = useState<AutomaticCostsResponse | null>(null);
  const [loadingAutomaticCosts, setLoadingAutomaticCosts] = useState(true);
  const [automaticCostsError, setAutomaticCostsError] = useState<string | null>(null);
  const [expandedAutomaticRows, setExpandedAutomaticRows] = useState<Set<string>>(new Set());
  const [canOpenOrders] = useState(storedUserCanAccessOrders);

  const isProductExpense = isProductExpenseCategory(addCategory);
  const productItemsTotal = useMemo(() => sumProductExpenseItems(productItems.map(item => ({
    quantity: Number(item.quantity),
    value: currencyInputToNumber(item.value),
  }))), [productItems]);

  useEffect(() => {
    const controller = new AbortController();
    const loadAutomaticCosts = async () => {
      setLoadingAutomaticCosts(true);
      setAutomaticCosts(null);
      setAutomaticCostsError(null);
      setExpandedAutomaticRows(new Set());
      try {
        const params = new URLSearchParams({
          month: String(d.selectedMonth + 1),
          year: String(d.selectedYear),
          unit: d.selectedUnit,
        });
        const response = await fetch(`/api/costs/automatic?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os custos automáticos.');
        setAutomaticCosts(payload);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAutomaticCosts(null);
        setAutomaticCostsError(error instanceof Error ? error.message : 'Não foi possível carregar os custos automáticos.');
      } finally {
        if (!controller.signal.aborted) setLoadingAutomaticCosts(false);
      }
    };
    loadAutomaticCosts();
    return () => controller.abort();
  }, [d.selectedMonth, d.selectedUnit, d.selectedYear]);

  /* ─── Derived Data ─── */
  const filteredFixed = d.fixedExpenses.filter((e: FixedExpense) => e.value > 0 && (d.selectedUnit === 'all' || !e.unit || e.unit === d.selectedUnit));
  const selectedMonthKey = `${d.selectedYear}-${String(d.selectedMonth + 1).padStart(2, '0')}`;
  const unitFilteredBills = d.bills.filter((b: Bill) => d.selectedUnit === 'all' || !b.unit || b.unit === d.selectedUnit);
  const filteredBills = unitFilteredBills.filter((b: Bill) => {
    if (b.type === 'fixo') return true;
    if (b.refMonth) return b.refMonth === selectedMonthKey;
    return Boolean(b.dueDateManual?.startsWith(selectedMonthKey));
  });

  const availableCategories = useMemo(() => {
    const baseCategories = recurrence === 'once' ? BILL_CATEGORIES : FIXED_CATEGORIES;
    const savedCategories = [...filteredFixed, ...filteredBills]
      .map(expense => expense.category?.trim())
      .filter((category): category is string => Boolean(category));

    return Array.from(new Set([...baseCategories, ...savedCategories, ...customCategories]));
  }, [customCategories, filteredBills, filteredFixed, recurrence]);

  const costRows: CostRow[] = useMemo(() => {
    const rows: CostRow[] = [];

    const payroll = automaticCosts?.payroll;
    if (payroll && payroll.total > 0) {
      const competenceLabel = `${String(payroll.competenceMonth).padStart(2, '0')}/${payroll.competenceYear}`;
      rows.push({
        id: `automatic-payroll-${competenceLabel}`,
        name: `Folha de pagamento · competência ${competenceLabel}`,
        value: payroll.total,
        periodTotal: payroll.total,
        occurrenceCount: 1,
        recurrence: 'once',
        type: 'fixo',
        category: 'Salários',
        dueInfo: `Automático · dia 5`,
        isPaid: payroll.pendingTotal <= 0 && payroll.paidTotal > 0,
        paidPortion: payroll.paidTotal,
        pendingPortion: payroll.pendingTotal,
        recognizedPortion: 0,
        isHistorical: false,
        source: 'automatic-payroll',
        raw: payroll,
      });
    }

    const productOrders = automaticCosts?.productOrders || [];
    const productOrdersTotal = automaticCosts?.productOrdersTotal
      ?? productOrders.reduce((sum, order) => sum + order.totalPrice, 0);
    if (productOrders.length > 0 && productOrdersTotal > 0) {
      rows.push({
        id: `automatic-products-${selectedMonthKey}`,
        name: 'Pedidos de produtos',
        value: productOrdersTotal,
        periodTotal: productOrdersTotal,
        occurrenceCount: 1,
        recurrence: 'once',
        type: 'variavel',
        category: 'Produtos',
        dueInfo: `${productOrders.length} ${productOrders.length === 1 ? 'pedido lançado' : 'pedidos lançados'}`,
        isPaid: false,
        paidPortion: 0,
        pendingPortion: 0,
        recognizedPortion: productOrdersTotal,
        isHistorical: false,
        source: 'automatic-products',
        raw: productOrders,
      });
    }

    resolveRecurringCostsInMonth<FixedExpense>(filteredFixed, d.selectedYear, d.selectedMonth).forEach(e => {
      const fixedRecurrence = e.recurrence || 'monthly';
      const occurrences = recurringCostOccurrencesInMonth(e, d.selectedYear, d.selectedMonth);
      if (occurrences.length === 0) return;
      rows.push({
        id: e.id, name: e.name, value: e.value, periodTotal: e.value * occurrences.length,
        occurrenceCount: occurrences.length, recurrence: fixedRecurrence,
        type: 'fixo', category: e.category,
        dueInfo: fixedRecurrence === 'weekly'
          ? `Semanal · ${occurrences.length} vencimentos`
          : `Mensal · dia ${Number(occurrences[0].slice(8, 10))}`,
        isPaid: false, paidPortion: 0, pendingPortion: e.value * occurrences.length, recognizedPortion: 0,
        isHistorical: Boolean(e.effectiveTo && e.effectiveTo < todayDateKey()), source: 'fixed', raw: e,
      });
    });
    filteredBills.forEach((b: Bill) => {
      const isPaid = d.isBillPaid(b);
      const dueInfo = b.type === 'fixo'
        ? `Dia ${b.dueDay}`
        : (b.dueDateManual ? new Date(b.dueDateManual + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
      rows.push({
        id: b.id, name: b.name, value: b.value, periodTotal: b.value,
        occurrenceCount: 1, recurrence: b.type === 'fixo' ? 'monthly' : 'once',
        type: b.type, category: b.category,
        dueInfo, isPaid, paidPortion: isPaid ? b.value : 0, pendingPortion: isPaid ? 0 : b.value, recognizedPortion: 0,
        isHistorical: false,
        source: 'bill', raw: b,
      });
    });
    return rows.filter(r => {
      if (filterStatus === 'pago' && r.paidPortion <= 0) return false;
      if (filterStatus === 'pendente' && r.pendingPortion <= 0) return false;
      if (filterStatus === 'lancado' && r.recognizedPortion <= 0) return false;
      if (filterType === 'fixo' && r.type !== 'fixo') return false;
      if (filterType === 'variavel' && r.type !== 'variavel') return false;
      return true;
    }).map(row => {
      const isPartial = row.paidPortion > 0 && row.pendingPortion > 0;
      if (!isPartial || filterStatus === 'all') return row;
      const filteredValue = filterStatus === 'pago' ? row.paidPortion : row.pendingPortion;
      return {
        ...row,
        value: filteredValue,
        periodTotal: filteredValue,
        occurrenceCount: 1,
        isPaid: filterStatus === 'pago',
        paidPortion: filterStatus === 'pago' ? filteredValue : 0,
        pendingPortion: filterStatus === 'pendente' ? filteredValue : 0,
        recognizedPortion: 0,
      };
    }).sort((a, b) => {
      const automaticDifference = Number(b.source.startsWith('automatic-')) - Number(a.source.startsWith('automatic-'));
      return automaticDifference || b.periodTotal - a.periodTotal;
    });
  }, [automaticCosts, d, filteredBills, filteredFixed, filterStatus, filterType, selectedMonthKey]);

  const automaticCalendarExpenses = useMemo(() => {
    const expenses: Array<{
      key: string;
      name: string;
      value: number;
      category: string;
      date: string;
      isPaid: boolean;
      isRecognized?: boolean;
    }> = [];
    const payroll = automaticCosts?.payroll;
    if (payroll && payroll.total > 0) {
      const competenceLabel = `${String(payroll.competenceMonth).padStart(2, '0')}/${payroll.competenceYear}`;
      if (payroll.paidSalaryTotal > 0) {
        expenses.push({
          key: `automatic-payroll-salary-paid-${selectedMonthKey}`,
          name: `Salários pagos · competência ${competenceLabel}`,
          value: payroll.paidSalaryTotal,
          category: 'Salários',
          date: `${selectedMonthKey}-05`,
          isPaid: true,
        });
      }
      if (payroll.pendingSalaryTotal > 0) {
        expenses.push({
          key: `automatic-payroll-salary-pending-${selectedMonthKey}`,
          name: `Salários pendentes · competência ${competenceLabel}`,
          value: payroll.pendingSalaryTotal,
          category: 'Salários',
          date: `${selectedMonthKey}-05`,
          isPaid: false,
        });
      }
      if (payroll.paidFgtsTotal > 0) {
        expenses.push({
          key: `automatic-payroll-fgts-paid-${selectedMonthKey}`,
          name: `FGTS pago · competência ${competenceLabel}`,
          value: payroll.paidFgtsTotal,
          category: 'Encargos trabalhistas',
          date: `${selectedMonthKey}-05`,
          isPaid: true,
        });
      }
      if (payroll.pendingFgtsTotal > 0) {
        expenses.push({
          key: `automatic-payroll-fgts-pending-${selectedMonthKey}`,
          name: `FGTS pendente · competência ${competenceLabel}`,
          value: payroll.pendingFgtsTotal,
          category: 'Encargos trabalhistas',
          date: `${selectedMonthKey}-05`,
          isPaid: false,
        });
      }
    }
    automaticCosts?.productOrders.forEach(order => {
      expenses.push({
        key: `automatic-order-${order.id}`,
        name: order.productName,
        value: order.totalPrice,
        category: 'Produtos',
        date: order.costRecognizedAt.slice(0, 10),
        isPaid: false,
        isRecognized: true,
      });
    });
    return expenses;
  }, [automaticCosts, selectedMonthKey]);

  const reportAutomaticExpenses = useMemo(() => automaticCalendarExpenses.map(expense => ({
    name: expense.name,
    category: expense.category,
    type: expense.category === 'Produtos' ? 'Pedido' : 'Folha automática',
    dueDate: expense.date.split('-').reverse().join('/'),
    value: expense.value,
    status: expense.isRecognized
      ? 'Lançado' as const
      : expense.isPaid ? 'Pago' as const : 'Pendente' as const,
  })), [automaticCalendarExpenses]);

  const resetForm = () => {
    setAddName(''); setAddValue(''); setAddCategory('Outros');
    setAddDueDate(''); setAddRefMonth(''); setAddObs(''); setProductItems([]); setRecurrence('once'); setEditingRow(null);
  };

  const openAddForm = () => {
    resetForm();
    setShowAddForm(true);
  };

  const getActiveFixedVersion = (row: CostRow) => {
    if (row.source !== 'fixed') return null;
    const seriesId = row.raw.seriesId || String(row.raw.id);
    return d.fixedExpenses.find((expense: FixedExpense) =>
      !expense.effectiveTo && (expense.seriesId || String(expense.id)) === seriesId
    ) || null;
  };

  const openEditForm = (row: CostRow) => {
    if (row.source.startsWith('automatic-')) return;
    if (row.isPaid) return;
    const activeVersion = row.isHistorical ? getActiveFixedVersion(row) : null;
    if (row.isHistorical && !activeVersion) return;
    const editableRow = activeVersion
      ? {
          ...row,
          id: activeVersion.id,
          name: activeVersion.name,
          value: activeVersion.value,
          category: activeVersion.category,
          recurrence: activeVersion.recurrence || 'monthly',
          isHistorical: false,
          raw: activeVersion,
        }
      : row;
    setEditingRow(editableRow);
    setAddName(editableRow.name);
    setAddValue(formatCurrency(String(Math.round(editableRow.value * 100))));
    setAddCategory(editableRow.category || 'Outros');
    if (isProductExpenseCategory(editableRow.category)) {
      const storedItems = normalizeProductExpenseItems(editableRow.raw.items);
      const items = storedItems.length > 0
        ? storedItems
        : [{ id: `legado-${editableRow.id}`, name: editableRow.name, quantity: 1, value: editableRow.value }];
      setProductItems(items.map(item => ({
        id: item.id,
        name: item.name,
        quantity: String(item.quantity),
        value: currencyInputValue(item.value),
      })));
    } else {
      setProductItems([]);
    }
    const legacyFixedBillDate = editableRow.source === 'bill' && editableRow.raw.type === 'fixo'
      ? `${d.selectedYear}-${String(d.selectedMonth + 1).padStart(2, '0')}-${String(editableRow.raw.dueDay || 1).padStart(2, '0')}`
      : '';
    setAddDueDate(editableRow.source === 'fixed' ? editableRow.raw.date || '' : editableRow.raw.dueDateManual || legacyFixedBillDate);
    setAddRefMonth(editableRow.raw.refMonth || '');
    setAddObs(editableRow.raw.obs || '');
    setRecurrence(editableRow.recurrence);
    setShowAddForm(true);
  };

  /* ─── Add/edit cost handler ─── */
  const handleSave = () => {
    const normalizedItems = isProductExpense
      ? normalizeProductExpenseItems(productItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: Number(item.quantity),
          value: currencyInputToNumber(item.value),
        })))
      : [];
    if (isProductExpense && normalizedItems.length !== productItems.length) {
      return alert('Informe nome, quantidade inteira maior que zero e valor unitário para todos os produtos.');
    }
    const val = isProductExpense ? sumProductExpenseItems(normalizedItems) : currencyInputToNumber(addValue);
    if (!addName.trim() || val <= 0) return alert('Informe nome e valor da despesa.');
    if (!addDueDate) return alert('Informe a data.');

    const fixedDraft = {
      name: addName,
      value: addValue,
      category: addCategory,
      date: addDueDate,
      unit: d.fixedUnit,
      obs: addObs,
      recurrence: recurrence === 'weekly' ? 'weekly' : 'monthly',
      items: isProductExpense ? normalizedItems : undefined,
    };
    const billDraft = {
          name: addName,
          value: addValue,
          type: 'variavel',
          dueDate: addDueDate,
          category: addCategory,
          unit: d.billUnit,
          refMonth: addRefMonth,
          obs: addObs,
          items: isProductExpense ? normalizedItems : undefined,
    };

    let saved = false;
    if (!editingRow) {
      saved = recurrence === 'once' ? d.addBill(billDraft) : d.addFixed(fixedDraft);
    } else if (editingRow.source === 'fixed') {
      if (recurrence === 'once') {
        saved = d.addBill(billDraft);
        if (saved) d.endFixed(editingRow.id, todayDateKey());
      } else {
        saved = d.reviseFixed(editingRow.id, fixedDraft, currentMonthStartDateKey());
      }
    } else if (recurrence === 'once') {
      d.editBill(editingRow.id, {
        name: addName.trim(), value: val, type: 'variavel', dueDay: null,
        dueDateManual: addDueDate, category: addCategory, unit: d.billUnit,
        refMonth: addRefMonth || undefined, obs: addObs || undefined,
        items: isProductExpense ? normalizedItems : undefined,
      });
      saved = true;
    } else {
      saved = d.addFixed(fixedDraft);
      if (saved) d.deleteBill(editingRow.id);
    }

    if (!saved) return;
    resetForm();
    setShowAddForm(false);
  };

  const handleCreateCategory = (category: string) => {
    setCustomCategories(current => current.some(item => item.toLocaleLowerCase('pt-BR') === category.toLocaleLowerCase('pt-BR'))
      ? current
      : [...current, category]);
  };

  const handleCategoryChange = (category: string) => {
    setAddCategory(category);
    if (isProductExpenseCategory(category) && productItems.length === 0) {
      setProductItems([editableProductItem('', addValue)]);
    }
  };

  /* ─── Delete handler ─── */
  const handleDelete = (row: CostRow) => {
    if (row.source.startsWith('automatic-')) return;
    if (confirm(`Deseja excluir ${row.name}?`)) {
      if (row.source === 'fixed') d.deleteFixed(row.id);
      else d.deleteBill(row.id);
    }
  };

  const toggleAutomaticRow = (rowId: string) => {
    setExpandedAutomaticRows(current => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const handleGenerateReport = async () => {
    if (generatingReport || loadingAutomaticCosts || automaticCostsError) return;
    setGeneratingReport(true);
    try {
      const { downloadMonthlyFinancialReport } = await import('@/lib/monthly-financial-report');
      await downloadMonthlyFinancialReport({
        selectedMonth: d.selectedMonth,
        selectedYear: d.selectedYear,
        selectedUnit: d.selectedUnit,
        logs: d.logs,
        fixedExpenses: d.fixedExpenses,
        bills: d.bills,
        additionalExpenses: reportAutomaticExpenses,
      });
    } catch (error) {
      console.error('[Financial Report] Falha ao gerar PDF:', error);
      alert(error instanceof Error
        ? error.message
        : 'Não foi possível gerar o relatório financeiro. Tente novamente.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const totalPendente = costRows.reduce((sum, row) => sum + row.pendingPortion, 0);
  const totalPago = costRows.reduce((sum, row) => sum + row.paidPortion, 0);
  const totalLancado = costRows.reduce((sum, row) => sum + row.recognizedPortion, 0);
  const totalDespesas = totalPendente + totalPago + totalLancado;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60, fontFamily: 'Inter, sans-serif' }}>
      
      {/* ─── TOP BAR ─── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <PeriodSelector selectedMonth={d.selectedMonth} setSelectedMonth={d.setSelectedMonth} selectedYear={d.selectedYear} setSelectedYear={d.setSelectedYear} />
        </div>
        
        <div style={{ display: 'flex', maxWidth: '100%', overflowX: 'auto', background: 'var(--card-bg)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <button onClick={() => setViewMode('pagamentos')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'pagamentos' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'pagamentos' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'pagamentos' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'pagamentos' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Despesas</button>
          <button onClick={() => setViewMode('receitas')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'receitas' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'receitas' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'receitas' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'receitas' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Receitas</button>
          <button onClick={() => setViewMode('calendario')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'calendario' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'calendario' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'calendario' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'calendario' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Calendário</button>
          <button onClick={() => setViewMode('lucratividade')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'lucratividade' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'lucratividade' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'lucratividade' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'lucratividade' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Resultado gerencial</button>
        </div>

        <div style={{ display: 'flex', flex: '1 1 220px', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={handleGenerateReport} disabled={generatingReport || loadingAutomaticCosts || Boolean(automaticCostsError)} title={automaticCostsError ? 'Relatório indisponível enquanto os custos automáticos não carregarem' : 'Gerar relatório financeiro mensal em PDF'} style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 12, background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, fontFamily: 'inherit', cursor: generatingReport || loadingAutomaticCosts ? 'wait' : automaticCostsError ? 'not-allowed' : 'pointer', opacity: generatingReport || loadingAutomaticCosts || automaticCostsError ? 0.65 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 19, color: '#ef4444' }}>picture_as_pdf</span>
            {generatingReport ? 'Gerando...' : loadingAutomaticCosts ? 'Atualizando...' : 'Relatório PDF'}
          </button>
          {viewMode === 'pagamentos' && (
            <>
              {canOpenOrders && (
                <a href="/pedidos" style={{ display: 'flex', minHeight: 44, alignItems: 'center', gap: 7, border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 12, background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, textDecoration: 'none' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--primary)' }}>shopping_cart</span>
                  Pedidos
                </a>
              )}
              <button onClick={openAddForm} style={{
                display: 'flex', minHeight: 44, alignItems: 'center', gap: 8, background: 'var(--primary)', color: 'white',
                border: 'none', padding: '10px 20px', borderRadius: 12, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(230, 0, 126, 0.25)', transition: 'transform 0.15s'
              }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
                Nova Despesa
              </button>
            </>
          )}
        </div>
      </div>

      {automaticCostsError && (
        <div role="alert" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: '0.82rem', fontWeight: 650 }}>
          Custos manuais carregados. {automaticCostsError}
        </div>
      )}

      {viewMode === 'lucratividade' ? (
        <LucratividadeView
          d={d}
          automaticFixedCosts={automaticCosts?.payroll?.total || 0}
          automaticVariableCosts={automaticCosts?.productOrdersTotal || 0}
        />
      ) : viewMode === 'receitas' ? (
        <RevenueView d={d} />
      ) : viewMode === 'calendario' ? (
        <CostCalendar
          fixedExpenses={filteredFixed}
          bills={unitFilteredBills}
          revenues={d.logs.filter((entry: LogEntry) =>
            isManualRevenue(entry) && (d.selectedUnit === 'all' || entry.unit === d.selectedUnit)
          )}
          selectedMonth={d.selectedMonth}
          selectedYear={d.selectedYear}
          automaticExpenses={automaticCalendarExpenses}
        />
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
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>inventory_2</span>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>PEDIDOS LANÇADOS</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{fmt(totalLancado)}</div>
            <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 650 }}>Sem baixa de pagamento</div>
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-muted)' }}>account_balance_wallet</span>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>TOTAL DO MÊS</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{fmt(totalDespesas)}</div>
            {loadingAutomaticCosts && <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600 }}>Atualizando folha e pedidos...</div>}
          </div>
        </div>

      </div>

      {/* ─── FILTERS ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', maxWidth: '100%', overflowX: 'auto', background: 'var(--bg)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
          {(['all', 'pendente', 'pago', 'lancado'] as const).map(opt => (
            <button key={opt} onClick={() => setFilterStatus(opt)} style={{
              minHeight: 44, padding: '6px 14px', border: 'none', background: filterStatus === opt ? 'var(--card-bg)' : 'transparent',
              borderRadius: 8, color: filterStatus === opt ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: filterStatus === opt ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer',
              boxShadow: filterStatus === opt ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s'
            }}>
              {opt === 'all' ? 'Todos os Status' : opt === 'pendente' ? 'Pendentes' : opt === 'pago' ? 'Pagos' : 'Lançados'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', maxWidth: '100%', overflowX: 'auto', background: 'var(--bg)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
          {['all', 'fixo', 'variavel'].map(opt => (
            <button key={opt} onClick={() => setFilterType(opt as any)} style={{
              minHeight: 44, padding: '6px 14px', border: 'none', background: filterType === opt ? 'var(--card-bg)' : 'transparent',
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
        <div className="cost-table-scroll" style={{ overflowX: 'auto' }}>
          <table className="cost-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
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
                    <div>{loadingAutomaticCosts ? 'Atualizando folha e pedidos...' : 'Nenhuma despesa encontrada'}</div>
                  </td>
                </tr>
              ) : (
                costRows.map(row => {
                  const rowId = String(row.id);
                  const isAutomatic = row.source.startsWith('automatic-');
                  const isExpanded = isAutomatic && expandedAutomaticRows.has(rowId);
                  const isManualProduct = !isAutomatic && normalizeCategoryLabel(row.category) === 'produtos';
                  const manualProductItems = isManualProduct ? normalizeProductExpenseItems(row.raw.items) : [];
                  const sourceLabel = row.source === 'automatic-payroll'
                    ? 'Automático · Folha'
                    : row.source === 'automatic-products'
                      ? 'Automático · Pedidos'
                      : row.recurrence === 'weekly'
                        ? 'Fixo semanal'
                        : row.recurrence === 'monthly'
                          ? 'Fixo mensal'
                          : 'Único';

                  return (
                    <Fragment key={row.id}>
                      <tr className="cost-main-row" style={{ borderTop: '1px solid var(--border)', transition: 'background 0.2s', background: isExpanded ? 'var(--bg)' : 'transparent' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'} onMouseLeave={e => e.currentTarget.style.background = isExpanded ? 'var(--bg)' : 'transparent'}>
                        <td className="cost-name-cell" style={{ padding: '16px 20px' }}>
                          <div style={{ fontWeight: 650, color: 'var(--text-main)', fontSize: '0.95rem' }}>{row.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                            <span style={{ fontSize: '0.7rem', padding: '3px 7px', borderRadius: 5, background: isAutomatic ? 'rgba(139,92,246,0.12)' : row.type === 'fixo' ? 'rgba(99,102,241,0.1)' : 'rgba(249,115,22,0.1)', color: isAutomatic ? 'var(--primary)' : row.type === 'fixo' ? '#6366f1' : '#f97316', fontWeight: 750 }}>
                              {sourceLabel}
                            </span>
                            {isManualProduct && (
                              <span style={{ fontSize: '0.68rem', padding: '3px 7px', borderRadius: 5, background: 'rgba(100,116,139,0.12)', color: 'var(--text-muted)', fontWeight: 800 }}>Manual</span>
                            )}
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.category}</span>
                          </div>
                          {manualProductItems.length > 0 && (
                            <div title={manualProductItems.map(item => `${item.quantity}x ${item.name}`).join(', ')} style={{ maxWidth: 420, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                              {manualProductItems.length} {manualProductItems.length === 1 ? 'produto' : 'produtos'} · {manualProductItems.map(item => `${item.quantity}x ${item.name}`).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="cost-due-cell" style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{row.dueInfo}</td>
                        <td className="cost-value-cell" style={{ padding: '16px 20px', fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                          {fmt(row.value)}
                          {row.occurrenceCount > 1 && (
                            <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600 }}>
                              {row.occurrenceCount}x no mês · {fmt(row.periodTotal)}
                            </div>
                          )}
                        </td>
                        <td className="cost-status-cell" style={{ padding: '16px 20px' }}>
                          {row.source === 'automatic-products' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(139,92,246,0.1)', color: 'var(--primary)', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>inventory_2</span> Lançado
                            </span>
                          ) : row.paidPortion > 0 && row.pendingPortion > 0 ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(245,158,11,0.12)', color: '#b45309', borderRadius: 6, fontSize: '0.8rem', fontWeight: 750 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>pending</span> Parcial
                            </span>
                          ) : row.isPaid ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span> Pago
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span> Pendente
                            </span>
                          )}
                        </td>
                        <td className="cost-actions-cell" style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            {isAutomatic ? (
                              <button type="button" onClick={() => toggleAutomaticRow(rowId)} aria-expanded={isExpanded} aria-label={isExpanded ? `Recolher detalhes de ${row.name}` : `Exibir detalhes de ${row.name}`} title={isExpanded ? 'Recolher detalhes' : 'Exibir detalhes'} style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border)', background: isExpanded ? 'rgba(139,92,246,0.12)' : 'var(--card-bg)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
                              </button>
                            ) : (
                              <>
                                {!row.isPaid && (!row.isHistorical || getActiveFixedVersion(row)) && (
                                  <button onClick={() => openEditForm(row)} title="Editar" style={{ width: 40, height: 40, borderRadius: 9, border: 'none', background: 'rgba(139,92,246,0.1)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                                  </button>
                                )}
                                {row.source === 'bill' && !row.isPaid && (
                                  <button onClick={() => d.markPaid(row.id)} title="Marcar como Pago" style={{ width: 40, height: 40, borderRadius: 9, border: 'none', background: 'rgba(34,197,94,0.1)', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>
                                  </button>
                                )}
                                {row.source === 'bill' && row.isPaid && (
                                  <button onClick={() => d.unmarkBillPaid(row.raw)} title="Desfazer Pagamento" style={{ width: 40, height: 40, borderRadius: 9, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                                  </button>
                                )}
                                {!row.isHistorical && (
                                  <button onClick={() => handleDelete(row)} title="Excluir" style={{ width: 40, height: 40, borderRadius: 9, border: 'none', background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="cost-detail-row" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                          <td colSpan={5} style={{ padding: '0 20px 18px' }}>
                            <AutomaticCostDetails row={row} canOpenOrders={canOpenOrders} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* ─── ADD MODAL ─── */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, padding: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeSlide 0.2s ease-out', overflowY: 'auto' }}>
          <div style={{ background: 'var(--card-bg)', width: '100%', maxWidth: 600, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', borderRadius: 20, padding: 'clamp(20px, 5vw, 32px)', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 24px', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>{editingRow ? 'edit' : 'add_circle'}</span>
              {editingRow ? 'Editar Despesa' : 'Nova Despesa'}
            </h2>
            
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Nome da Despesa</label>
                <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder={isProductExpense ? 'Ex: Compra de setembro, Fornecedor...' : 'Ex: Aluguel, Internet...'} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.95rem', fontFamily: 'inherit' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Categoria</label>
                <CategorySelector
                  value={addCategory}
                  onChange={handleCategoryChange}
                  categories={availableCategories}
                  onCreateCategory={handleCreateCategory}
                />
              </div>

              {isProductExpense && (
                <ProductExpenseItemsEditor
                  items={productItems}
                  total={productItemsTotal}
                  onChange={setProductItems}
                />
              )}

              <div className="product-expense-value-date" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{isProductExpense ? 'Total dos Produtos' : 'Valor'}</label>
                  {isProductExpense ? (
                    <div aria-live="polite" style={{ width: '100%', minHeight: 46, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.07)', color: '#f97316', fontSize: '0.95rem', fontFamily: 'inherit', fontWeight: 850 }}>
                      {fmt(productItemsTotal)}
                    </div>
                  ) : (
                    <input type="text" inputMode="numeric" value={addValue} onChange={e => setAddValue(formatCurrency(e.target.value))} placeholder="R$ 0,00" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.95rem', fontFamily: 'inherit', fontWeight: 700 }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{recurrence === 'once' ? 'Vencimento' : 'Primeiro vencimento'}</label>
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

              {recurrence === 'once' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Mês de Referência (Opcional, ex: Maio 2024)</label>
                  <input type="month" value={addRefMonth} onChange={e => setAddRefMonth(e.target.value)} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.95rem', fontFamily: 'inherit' }} />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Recorrência</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, padding: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  {([
                    { value: 'monthly', label: 'Mensal', icon: 'calendar_month' },
                    { value: 'weekly', label: 'Semanal', icon: 'date_range' },
                    { value: 'once', label: 'Único', icon: 'looks_one' },
                  ] as const).map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRecurrence(option.value)}
                      style={{ minWidth: 0, minHeight: 58, padding: '8px 5px', border: recurrence === option.value ? '1px solid rgba(139,92,246,0.45)' : '1px solid transparent', borderRadius: 9, background: recurrence === option.value ? 'rgba(139,92,246,0.12)' : 'transparent', color: recurrence === option.value ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', gap: 3, fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 750 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
                {editingRow?.source === 'fixed' && (
                  <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.4 }}>
                    A nova configuração valerá a partir de hoje. Os meses anteriores serão preservados.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => { resetForm(); setShowAddForm(false); }} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={handleSave} style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(230, 0, 126, 0.2)' }}>
                {editingRow ? 'Salvar Alterações' : 'Adicionar Despesa'}
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
        @media (max-width: 640px) {
          .product-expense-value-date { grid-template-columns: minmax(0, 1fr) !important; }
          .product-expense-item-row {
            grid-template-columns: 84px minmax(0, 1fr) 44px !important;
            align-items: end !important;
          }
          .product-expense-item-name { grid-column: 1 / 3; grid-row: 1; }
          .product-expense-item-remove { grid-column: 3; grid-row: 1; }
          .product-expense-item-quantity { grid-column: 1; grid-row: 2; }
          .product-expense-item-value { grid-column: 2 / 4; grid-row: 2; }
          .cost-table-scroll { overflow-x: visible !important; }
          .cost-table,
          .cost-table tbody { display: block; width: 100%; }
          .cost-table thead { display: none; }
          .cost-main-row {
            display: grid;
            width: 100%;
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-areas:
              "name actions"
              "due status"
              "value status";
            gap: 8px 12px;
            padding: 14px 12px;
          }
          .cost-main-row > td { min-width: 0; padding: 0 !important; white-space: normal !important; }
          .cost-name-cell { grid-area: name; }
          .cost-name-cell > div:first-child { overflow-wrap: anywhere; }
          .cost-due-cell { grid-area: due; }
          .cost-value-cell { grid-area: value; }
          .cost-status-cell { grid-area: status; align-self: end; text-align: right; }
          .cost-actions-cell { grid-area: actions; }
          .cost-detail-row { display: block; width: 100%; }
          .cost-detail-row > td { display: block; width: 100%; padding: 0 12px 14px !important; white-space: normal !important; overflow-wrap: anywhere; }
          .cost-detail-row > td * { max-width: 100%; }
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
