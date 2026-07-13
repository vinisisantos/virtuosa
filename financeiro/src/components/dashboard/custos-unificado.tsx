'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { FixedExpense, Bill, LogEntry, fmt, FIXED_CATEGORIES, BILL_CATEGORIES, MONTHS, formatCurrency } from '@/hooks/useDashboard';
import { DatePicker } from '@/components/ui/date-picker';
import { CategorySelector } from '@/components/category-selector';
import { LucratividadeView } from './lucratividade-view';
import { CostCalendar } from './cost-calendar';
import { RevenueView } from './revenue-view';
import { isManualRevenue } from '@/lib/revenue';
import { CostRecurrence, currentMonthStartDateKey, recurringCostOccurrencesInMonth, resolveRecurringCostsInMonth, todayDateKey } from '@/lib/cost-recurrence';

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
  isHistorical: boolean;
  source: 'fixed' | 'bill';
  raw: any;
}

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* ═══════════════════════════════════════════ */
/* ─── MAIN COMPONENT ─── */
/* ═══════════════════════════════════════════ */
export function CustosUnificado({ d }: { d: any }) {
  /* ─── UI state ─── */
  const [viewMode, setViewMode] = useState<'pagamentos' | 'receitas' | 'calendario' | 'lucratividade'>('pagamentos');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pago' | 'pendente'>('all');
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
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);

  /* ─── Derived Data ─── */
  const filteredFixed = d.fixedExpenses.filter((e: FixedExpense) => e.value > 0 && (d.selectedUnit === 'all' || !e.unit || e.unit === d.selectedUnit));
  const filteredBills = d.bills.filter((b: Bill) => d.selectedUnit === 'all' || !b.unit || b.unit === d.selectedUnit);

  const availableCategories = useMemo(() => {
    const baseCategories = recurrence === 'once' ? BILL_CATEGORIES : FIXED_CATEGORIES;
    const savedCategories = [...filteredFixed, ...filteredBills]
      .map(expense => expense.category?.trim())
      .filter((category): category is string => Boolean(category));

    return Array.from(new Set([...baseCategories, ...savedCategories, ...customCategories]));
  }, [customCategories, filteredBills, filteredFixed, recurrence]);

  const costRows: CostRow[] = useMemo(() => {
    const rows: CostRow[] = [];
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
        isPaid: false, isHistorical: Boolean(e.effectiveTo && e.effectiveTo < todayDateKey()), source: 'fixed', raw: e,
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
        dueInfo, isPaid,
        isHistorical: false,
        source: 'bill', raw: b,
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

  const resetForm = () => {
    setAddName(''); setAddValue(''); setAddCategory('Outros');
    setAddDueDate(''); setAddRefMonth(''); setAddObs(''); setRecurrence('once'); setEditingRow(null);
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
    const digits = addValue.replace(/[^\d]/g, '');
    const val = parseInt(digits, 10) / 100;
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

  /* ─── Delete handler ─── */
  const handleDelete = (row: CostRow) => {
    if (confirm(`Deseja excluir ${row.name}?`)) {
      if (row.source === 'fixed') d.deleteFixed(row.id);
      else d.deleteBill(row.id);
    }
  };

  const handleGenerateReport = async () => {
    if (generatingReport) return;
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

  const totalPendente = costRows.filter(r => !r.isPaid).reduce((s, r) => s + r.periodTotal, 0);
  const totalPago = costRows.filter(r => r.isPaid).reduce((s, r) => s + r.periodTotal, 0);
  const totalDespesas = totalPendente + totalPago;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60, fontFamily: 'Inter, sans-serif' }}>
      
      {/* ─── TOP BAR ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <div>
          <PeriodSelector selectedMonth={d.selectedMonth} setSelectedMonth={d.setSelectedMonth} selectedYear={d.selectedYear} setSelectedYear={d.setSelectedYear} />
        </div>
        
        <div style={{ display: 'flex', background: 'var(--card-bg)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <button onClick={() => setViewMode('pagamentos')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'pagamentos' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'pagamentos' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'pagamentos' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'pagamentos' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Despesas</button>
          <button onClick={() => setViewMode('receitas')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'receitas' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'receitas' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'receitas' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'receitas' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Receitas</button>
          <button onClick={() => setViewMode('calendario')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'calendario' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'calendario' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'calendario' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'calendario' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Calendário</button>
          <button onClick={() => setViewMode('lucratividade')} style={{ padding: '8px 16px', border: 'none', background: viewMode === 'lucratividade' ? 'var(--bg)' : 'transparent', borderRadius: 8, color: viewMode === 'lucratividade' ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: viewMode === 'lucratividade' ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: viewMode === 'lucratividade' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}>Lucratividade (DRE)</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={handleGenerateReport} disabled={generatingReport} title="Gerar relatório financeiro mensal em PDF" style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 12, background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, fontFamily: 'inherit', cursor: generatingReport ? 'wait' : 'pointer', opacity: generatingReport ? 0.65 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 19, color: '#ef4444' }}>picture_as_pdf</span>
            {generatingReport ? 'Gerando...' : 'Relatório PDF'}
          </button>
          {viewMode === 'pagamentos' && (
            <button onClick={openAddForm} style={{
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
      ) : viewMode === 'receitas' ? (
        <RevenueView d={d} />
      ) : viewMode === 'calendario' ? (
        <CostCalendar
          fixedExpenses={filteredFixed}
          bills={filteredBills}
          revenues={d.logs.filter((entry: LogEntry) =>
            isManualRevenue(entry) && (d.selectedUnit === 'all' || entry.unit === d.selectedUnit)
          )}
          selectedMonth={d.selectedMonth}
          selectedYear={d.selectedYear}
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
                          {row.recurrence === 'weekly' ? 'Fixo semanal' : row.recurrence === 'monthly' ? 'Fixo mensal' : 'Único'}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.category}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {row.dueInfo}
                    </td>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                      {fmt(row.value)}
                      {row.occurrenceCount > 1 && (
                        <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600 }}>
                          {row.occurrenceCount}x no mês · {fmt(row.periodTotal)}
                        </div>
                      )}
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
                        {!row.isPaid && (!row.isHistorical || getActiveFixedVersion(row)) && (
                          <button onClick={() => openEditForm(row)} title="Editar" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(139,92,246,0.1)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                          </button>
                        )}
                        {row.source === 'bill' && !row.isPaid && (
                          <button onClick={() => d.markPaid(row.id)} title="Marcar como Pago" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>
                          </button>
                        )}
                        {row.source === 'bill' && row.isPaid && (
                          <button onClick={() => d.unmarkBillPaid(row.raw)} title="Desfazer Pagamento" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                          </button>
                        )}
                        {!row.isHistorical && (
                          <button onClick={() => handleDelete(row)} title="Excluir" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                          </button>
                        )}
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
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>{editingRow ? 'edit' : 'add_circle'}</span>
              {editingRow ? 'Editar Despesa' : 'Nova Despesa'}
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
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Categoria</label>
                <CategorySelector
                  value={addCategory}
                  onChange={setAddCategory}
                  categories={availableCategories}
                  onCreateCategory={handleCreateCategory}
                />
              </div>

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
