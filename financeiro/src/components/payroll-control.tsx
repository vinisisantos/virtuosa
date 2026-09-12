'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/currency';
import { normalizePayrollSyncUnit, publishPayrollSync } from '@/lib/payroll-client-sync';
import {
  AUTOMATIC_TRANSPORT_LABEL,
  CURRENT_MINIMUM_WAGE,
  HAZARD_PAY_RATES,
  PAYROLL_ADJUSTMENT_KINDS,
  calculateAutomaticTransportDiscount,
  calculateAdjustmentDelta,
  calculateAdjustmentValue,
  calculatePayrollLegalFigures,
  calculatePayrollTotal,
  getPayrollBaseSalary,
} from '@/lib/payroll-adjustments';
import type {
  EmploymentType,
  HazardPayRate,
  PayrollAdjustmentData,
  PayrollAdjustmentDirection,
  PayrollAdjustmentKind,
  PayrollEntryData,
  PayrollSummary,
} from '@/lib/types';
import styles from './payroll-control.module.css';

interface PayrollControlProps {
  entries: PayrollEntryData[];
  summary: PayrollSummary;
  loading: boolean;
  loadError: string;
  competenceMonth: number;
  competenceYear: number;
  selectedUnit: string;
  onRefresh: () => Promise<string | null>;
}

interface EmployeeFormState {
  id?: string;
  employeeName: string;
  cargo: string;
  salary: string;
  bonus: string;
  employmentType: EmploymentType;
  hazardPayRate: HazardPayRate;
  hazardPayBase: string;
  transportDiscountEnabled: boolean;
  unit: string;
  expectedUpdatedAt?: string;
  scope: PayrollMutationScope;
}

interface AdjustmentDraft {
  payrollEntryId: string;
  kind: PayrollAdjustmentKind;
  direction: PayrollAdjustmentDirection;
  value: string;
  label: string;
  expectedEntryUpdatedAt: string;
  scope: PayrollMutationScope;
}

interface PayrollMutationScope {
  competenceMonth: number;
  competenceYear: number;
  unit: string;
}

const UNITS = ['Osasco', 'SBC', 'SCS'];
const ADJUSTMENT_ORDER: PayrollAdjustmentKind[] = ['absence', 'award', 'transport', 'advance', 'discount', 'addition', 'other'];

function samePayrollScope(left: PayrollMutationScope, right: PayrollMutationScope) {
  return left.competenceMonth === right.competenceMonth
    && left.competenceYear === right.competenceYear
    && normalizePayrollSyncUnit(left.unit) === normalizePayrollSyncUnit(right.unit);
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';
}

function toNumber(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyInput(value: number) {
  return Math.max(0, value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrencyInputFromTyping(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return formatCurrencyInput(Number(digits) / 100);
}

function formatPaymentDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function parseCurrencyInput(value: string) {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Não foi possível concluir a operação') as Error & {
      reloadRequired?: boolean;
    };
    error.reloadRequired = response.status === 409 && data.reloadRequired === true;
    throw error;
  }
  return data;
}

function adjustmentDisplay(entry: PayrollEntryData, adjustment: PayrollAdjustmentData) {
  const value = calculateAdjustmentValue(getPayrollBaseSalary(entry), entry.employmentType, adjustment);
  return adjustment.kind === 'absence'
    ? `${adjustment.quantity || 0} ${(adjustment.quantity || 0) === 1 ? 'dia' : 'dias'}`
    : formatCurrency(value);
}

export function PayrollControl({
  entries,
  summary,
  loading,
  loadError,
  competenceMonth,
  competenceYear,
  selectedUnit,
  onRefresh,
}: PayrollControlProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expansionScopeRef = useRef('');
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentDraft | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const mountedRef = useRef(true);
  const activeScopeRef = useRef<PayrollMutationScope>({ competenceMonth, competenceYear, unit: selectedUnit });
  const modalScopeKeyRef = useRef(`${competenceYear}-${competenceMonth}:${normalizePayrollSyncUnit(selectedUnit)}`);

  activeScopeRef.current = { competenceMonth, competenceYear, unit: selectedUnit };

  const isActiveScope = (scope: PayrollMutationScope) => (
    mountedRef.current && samePayrollScope(scope, activeScopeRef.current)
  );

  const handleMutationError = async (error: unknown, fallback: string, scope: PayrollMutationScope) => {
    if (error instanceof Error && 'reloadRequired' in error && error.reloadRequired === true) {
      if (isActiveScope(scope)) {
        setEmployeeForm(null);
        setAdjustmentDraft(null);
        await onRefresh();
      }
    }
    toast(error instanceof Error ? error.message : fallback, 'error');
  };

  const refreshAfterMutation = async (scope: PayrollMutationScope) => {
    if (!isActiveScope(scope)) {
      publishPayrollSync({ ...scope, revision: null });
      return;
    }

    const revision = await onRefresh();
    publishPayrollSync({ ...scope, revision });
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const scopeKey = `${competenceYear}-${competenceMonth}:${normalizePayrollSyncUnit(selectedUnit)}`;
    if (modalScopeKeyRef.current === scopeKey) return;
    modalScopeKeyRef.current = scopeKey;
    setEmployeeForm(null);
    setAdjustmentDraft(null);
  }, [competenceMonth, competenceYear, selectedUnit]);

  useEffect(() => {
    if (loading) return;
    if (entries.length === 0) {
      setExpandedId(null);
      return;
    }

    const expansionScope = `${selectedUnit}:${competenceYear}-${competenceMonth}`;
    if (expansionScopeRef.current !== expansionScope) {
      expansionScopeRef.current = expansionScope;
      setExpandedId(entries[0].id);
      return;
    }

    if (expandedId && !entries.some(entry => entry.id === expandedId)) {
      setExpandedId(null);
    }
  }, [competenceMonth, competenceYear, entries, expandedId, loading, selectedUnit]);

  const draftEntry = adjustmentDraft
    ? entries.find(entry => entry.id === adjustmentDraft.payrollEntryId)
    : undefined;
  const draftConfig = adjustmentDraft ? PAYROLL_ADJUSTMENT_KINDS[adjustmentDraft.kind] : null;
  const draftValue = adjustmentDraft
    ? draftConfig?.input === 'currency'
      ? parseCurrencyInput(adjustmentDraft.value)
      : toNumber(adjustmentDraft.value)
    : 0;
  const draftDelta = draftEntry && adjustmentDraft && draftValue > 0
    ? calculateAdjustmentDelta(getPayrollBaseSalary(draftEntry), draftEntry.employmentType, {
        kind: adjustmentDraft.kind,
        direction: adjustmentDraft.direction,
        quantity: draftConfig?.input === 'days' ? draftValue : null,
        amount: draftConfig?.input === 'currency' ? draftValue : null,
      })
    : 0;

  const displayedPayrollTotal = summary.totalPayroll + draftDelta;
  const hasUndefinedRegime = summary.undefinedRegimeCount > 0;

  const openNewEmployee = () => {
    const scope = { competenceMonth, competenceYear, unit: selectedUnit };
    setEmployeeForm({
      employeeName: '',
      cargo: '',
      salary: '',
      bonus: '',
      employmentType: null,
      hazardPayRate: 0,
      hazardPayBase: formatCurrencyInput(CURRENT_MINIMUM_WAGE),
      transportDiscountEnabled: false,
      unit: selectedUnit === 'all' ? 'Osasco' : selectedUnit,
      scope,
    });
  };

  const openEditEmployee = (entry: PayrollEntryData) => {
    const scope = { competenceMonth, competenceYear, unit: selectedUnit };
    setEmployeeForm({
      id: entry.id,
      employeeName: entry.employeeName,
      cargo: entry.cargo || '',
      salary: formatCurrencyInput(getPayrollBaseSalary(entry)),
      bonus: entry.bonus ? formatCurrencyInput(entry.bonus) : '',
      employmentType: entry.employmentType,
      hazardPayRate: entry.employmentType === 'CLT' ? entry.hazardPayRate : 0,
      hazardPayBase: formatCurrencyInput(entry.hazardPayBase ?? CURRENT_MINIMUM_WAGE),
      transportDiscountEnabled: entry.adjustments.some(
        adjustment => adjustment.kind === 'transport' && adjustment.label === AUTOMATIC_TRANSPORT_LABEL,
      ),
      unit: selectedUnit === 'all' ? 'Osasco' : selectedUnit,
      expectedUpdatedAt: entry.updatedAt,
      scope,
    });
  };

  const saveEmployee = async () => {
    if (!employeeForm) return;
    const mutationScope = employeeForm.scope;
    if (!isActiveScope(mutationScope)) {
      setEmployeeForm(null);
      return toast('A competência ou a unidade mudou. Abra o cadastro novamente.', 'warning');
    }
    const salary = parseCurrencyInput(employeeForm.salary);
    const bonus = parseCurrencyInput(employeeForm.bonus);
    const hazardPayBase = parseCurrencyInput(employeeForm.hazardPayBase);
    if (!employeeForm.employeeName.trim()) return toast('Informe o nome do colaborador', 'warning');
    if (!employeeForm.employmentType) return toast('Escolha o regime CLT ou PJ', 'warning');
    if (salary <= 0) return toast('Informe um salário maior que zero', 'warning');
    if (employeeForm.hazardPayRate > 0 && hazardPayBase <= 0) {
      return toast('Informe a base da insalubridade', 'warning');
    }

    setBusyKey('employee');
    try {
      const isEditing = Boolean(employeeForm.id);
      const response = await fetch('/api/payroll/entries', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEditing ? {
            id: employeeForm.id,
            expectedUpdatedAt: employeeForm.expectedUpdatedAt,
          } : {}),
          employeeName: employeeForm.employeeName.trim(),
          cargo: employeeForm.cargo.trim() || null,
          netSalary: salary,
          baseSalary: salary,
          bonus,
          employmentType: employeeForm.employmentType,
          hazardPayRate: employeeForm.employmentType === 'CLT' ? employeeForm.hazardPayRate : 0,
          hazardPayBase: employeeForm.employmentType === 'CLT' && employeeForm.hazardPayRate > 0
            ? hazardPayBase
            : null,
          transportDiscountEnabled: employeeForm.employmentType === 'CLT' && employeeForm.transportDiscountEnabled,
          ...(!isEditing ? {
            unit: employeeForm.unit,
            competenceMonth: mutationScope.competenceMonth,
            competenceYear: mutationScope.competenceYear,
            isRecurring: true,
          } : {}),
        }),
      });
      await parseResponse(response);
      await refreshAfterMutation(mutationScope);
      if (isActiveScope(mutationScope)) setEmployeeForm(null);
      toast(isEditing ? 'Colaborador atualizado' : 'Colaborador adicionado', 'success');
    } catch (error) {
      await handleMutationError(error, 'Erro ao salvar colaborador', mutationScope);
    } finally {
      setBusyKey('');
    }
  };

  const updateRegime = async (entry: PayrollEntryData, employmentType: EmploymentType) => {
    const mutationScope = { competenceMonth, competenceYear, unit: selectedUnit };
    setBusyKey(`regime:${entry.id}`);
    try {
      const response = await fetch('/api/payroll/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, employmentType, expectedUpdatedAt: entry.updatedAt }),
      });
      await parseResponse(response);
      await refreshAfterMutation(mutationScope);
      toast('Regime atualizado', 'success');
    } catch (error) {
      await handleMutationError(error, 'Erro ao atualizar regime', mutationScope);
    } finally {
      setBusyKey('');
    }
  };

  const deleteEmployee = async (entry: PayrollEntryData) => {
    const mutationScope = { competenceMonth, competenceYear, unit: selectedUnit };
    const confirmed = await confirmDialog({
      title: 'Remover colaborador',
      message: `Remover ${entry.employeeName} desta competência? Os ajustes vinculados também serão removidos e a recorrência não recriará o colaborador neste mês.`,
      confirmText: 'Remover',
      variant: 'danger',
    });
    if (!confirmed) return;
    if (!isActiveScope(mutationScope)) {
      return toast('A competência ou a unidade mudou. Selecione o colaborador novamente.', 'warning');
    }

    setBusyKey(`delete:${entry.id}`);
    try {
      const response = await fetch(
        `/api/payroll/entries?id=${encodeURIComponent(entry.id)}&expectedUpdatedAt=${encodeURIComponent(entry.updatedAt)}`,
        { method: 'DELETE' },
      );
      await parseResponse(response);
      await refreshAfterMutation(mutationScope);
      toast('Colaborador removido', 'success');
    } catch (error) {
      await handleMutationError(error, 'Erro ao remover colaborador', mutationScope);
    } finally {
      setBusyKey('');
    }
  };

  const togglePayment = async (entry: PayrollEntryData) => {
    const mutationScope = { competenceMonth, competenceYear, unit: selectedUnit };
    const markAsPaid = entry.paymentStatus !== 'paid';
    const hasFgts = entry.employmentType === 'CLT' && entry.hasFgts;
    const confirmed = await confirmDialog({
      title: markAsPaid ? 'Confirmar pagamento' : 'Desfazer confirmação',
      message: markAsPaid
        ? `Confirmar o pagamento de ${formatCurrency(calculatePayrollTotal(entry))} para ${entry.employeeName}? ${hasFgts ? 'O salário e o FGTS passarão a constar como pagos' : 'O salário passará a constar como pago'} nos Custos.`
        : `Desfazer a confirmação de pagamento de ${entry.employeeName}? ${hasFgts ? 'O salário e o FGTS voltarão a constar como pendentes' : 'O salário voltará a constar como pendente'} nos Custos.`,
      confirmText: markAsPaid ? 'Confirmar pagamento' : 'Desfazer',
      variant: markAsPaid ? 'info' : 'warning',
    });
    if (!confirmed) return;
    if (!isActiveScope(mutationScope)) {
      return toast('A competência ou a unidade mudou. Selecione o pagamento novamente.', 'warning');
    }

    setBusyKey(`payment:${entry.id}`);
    try {
      const response = await fetch('/api/payroll/payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          paymentStatus: markAsPaid ? 'paid' : 'unpaid',
          expectedUpdatedAt: entry.updatedAt,
          ...(mutationScope.unit !== 'all' ? { unit: mutationScope.unit } : {}),
        }),
      });
      await parseResponse(response);
      await refreshAfterMutation(mutationScope);
      toast(markAsPaid ? 'Pagamento confirmado' : 'Confirmação de pagamento desfeita', 'success');
    } catch (error) {
      await handleMutationError(error, 'Erro ao atualizar pagamento', mutationScope);
    } finally {
      setBusyKey('');
    }
  };

  const startAdjustment = (entry: PayrollEntryData) => {
    const kind: PayrollAdjustmentKind = entry.employmentType === 'CLT' ? 'absence' : 'award';
    setExpandedId(entry.id);
    setAdjustmentDraft({
      payrollEntryId: entry.id,
      kind,
      direction: PAYROLL_ADJUSTMENT_KINDS[kind].defaultDirection,
      value: '',
      label: '',
      expectedEntryUpdatedAt: entry.updatedAt,
      scope: { competenceMonth, competenceYear, unit: selectedUnit },
    });
  };

  const changeAdjustmentKind = (kind: PayrollAdjustmentKind) => {
    if (!adjustmentDraft) return;
    setAdjustmentDraft({
      ...adjustmentDraft,
      kind,
      direction: PAYROLL_ADJUSTMENT_KINDS[kind].defaultDirection,
      value: '',
    });
  };

  const saveAdjustment = async () => {
    if (!adjustmentDraft || !draftEntry || !draftConfig) return;
    const mutationScope = adjustmentDraft.scope;
    if (!isActiveScope(mutationScope)) {
      setAdjustmentDraft(null);
      return toast('A competência ou a unidade mudou. Abra o ajuste novamente.', 'warning');
    }
    if (!draftEntry.employmentType) return toast('Defina o regime antes de adicionar ajustes', 'warning');
    if (draftValue <= 0) return toast('Informe um valor maior que zero', 'warning');

    setBusyKey('adjustment');
    try {
      const response = await fetch('/api/payroll/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollEntryId: adjustmentDraft.payrollEntryId,
          expectedEntryUpdatedAt: adjustmentDraft.expectedEntryUpdatedAt,
          kind: adjustmentDraft.kind,
          direction: adjustmentDraft.direction,
          label: adjustmentDraft.label,
          quantity: draftConfig.input === 'days' ? draftValue : null,
          amount: draftConfig.input === 'currency' ? draftValue : null,
        }),
      });
      await parseResponse(response);
      await refreshAfterMutation(mutationScope);
      if (isActiveScope(mutationScope)) setAdjustmentDraft(null);
      toast('Ajuste adicionado', 'success');
    } catch (error) {
      await handleMutationError(error, 'Erro ao adicionar ajuste', mutationScope);
    } finally {
      setBusyKey('');
    }
  };

  const deleteAdjustment = async (adjustment: PayrollAdjustmentData) => {
    const mutationScope = { competenceMonth, competenceYear, unit: selectedUnit };
    setBusyKey(`adjustment:${adjustment.id}`);
    try {
      const response = await fetch(
        `/api/payroll/adjustments?id=${encodeURIComponent(adjustment.id)}&expectedUpdatedAt=${encodeURIComponent(adjustment.updatedAt)}`,
        { method: 'DELETE' },
      );
      await parseResponse(response);
      await refreshAfterMutation(mutationScope);
      toast('Ajuste removido', 'success');
    } catch (error) {
      await handleMutationError(error, 'Erro ao remover ajuste', mutationScope);
    } finally {
      setBusyKey('');
    }
  };

  const saveSheet = async () => {
    await onRefresh();
    toast('Folha atualizada e salva', 'success');
  };

  return (
    <section className={styles.root}>
      <div className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}><span className="material-symbols-outlined">payments</span></div>
          <span className={styles.summaryLabel}>Total da folha</span>
          <strong className={styles.summaryValue}>{formatCurrency(displayedPayrollTotal)}</strong>
          <span className={styles.summaryMeta}>Líquido estimado após INSS e ajustes</span>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}><span className="material-symbols-outlined">group</span></div>
          <span className={styles.summaryLabel}>Colaboradores</span>
          <strong className={styles.summaryValue}>{summary.totalEmployees}</strong>
          <span className={styles.summaryMeta}>
            {summary.cltCount} CLT · {summary.pjCount} PJ
            {hasUndefinedRegime ? ` · ${summary.undefinedRegimeCount} a definir` : ''}
          </span>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}><span className="material-symbols-outlined">tune</span></div>
          <span className={styles.summaryLabel}>Ajustes do mês</span>
          <div className={styles.adjustmentSummary}>
            <strong className={styles.credit}>+ {formatCurrency(summary.totalCredits + Math.max(0, draftDelta))}</strong>
            <strong className={styles.debit}>− {formatCurrency(summary.totalDebits + Math.max(0, -draftDelta))}</strong>
          </div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}><span className="material-symbols-outlined">account_balance</span></div>
          <span className={styles.summaryLabel}>FGTS estimado</span>
          <strong className={styles.summaryValue}>{formatCurrency(summary.totalFgts)}</strong>
          <span className={styles.summaryMeta}>
            Insalubridade {formatCurrency(summary.totalHazardPay)} · INSS {formatCurrency(summary.totalInss)}
          </span>
        </article>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Colaboradores</h2>
            <span className={styles.liveStatus}><i /> Cálculo atualizado em tempo real</span>
          </div>
          <button className={styles.compactAddButton} onClick={openNewEmployee}>
            <span className="material-symbols-outlined">person_add</span>
            Adicionar
          </button>
        </div>

        <div className={styles.tableHeader} aria-hidden="true">
          <span>Colaborador</span>
          <span>Regime</span>
          <span>Salário-base</span>
          <span>Ajustes</span>
          <span>Faltas</span>
          <span>Líquido</span>
          <span />
        </div>

        {loading ? (
          <div className={styles.stateBox}>
            <span className={`${styles.spinner} material-symbols-outlined`}>progress_activity</span>
            Carregando folha...
          </div>
        ) : loadError ? (
          <div className={styles.stateBox}>
            <span className="material-symbols-outlined">error</span>
            <strong>{loadError}</strong>
            <button onClick={() => void onRefresh()}>Tentar novamente</button>
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><span className="material-symbols-outlined">group_add</span></div>
            <h3>Comece adicionando um colaborador</h3>
            <p>Cadastre salário e regime para calcular a folha desta competência.</p>
            <button className={styles.primaryButton} onClick={openNewEmployee}>Adicionar colaborador</button>
          </div>
        ) : (
          <div className={styles.entryList}>
            {entries.map(entry => {
              const expanded = expandedId === entry.id;
              const isDraftEntry = adjustmentDraft?.payrollEntryId === entry.id;
              const persistedTotal = calculatePayrollTotal(entry);
              const legalFigures = calculatePayrollLegalFigures(entry);
              const total = persistedTotal + (isDraftEntry ? draftDelta : 0);
              const totalCredits = Math.max(0, entry.bonus || 0) + entry.adjustments
                .filter(adjustment => adjustment.direction === 'credit')
                .reduce((sum, adjustment) => sum + calculateAdjustmentValue(legalFigures.baseSalary, entry.employmentType, adjustment), 0);
              const totalDebits = entry.adjustments
                .filter(adjustment => adjustment.direction === 'debit')
                .reduce((sum, adjustment) => sum + calculateAdjustmentValue(legalFigures.baseSalary, entry.employmentType, adjustment), 0);
              const creditAdjustments = entry.adjustments.filter(adjustment => adjustment.direction === 'credit');
              const debitAdjustments = entry.adjustments.filter(adjustment => adjustment.direction === 'debit');
              const draftCredit = isDraftEntry && draftDelta > 0 ? draftDelta : 0;
              const draftDebit = isDraftEntry && draftDelta < 0 ? Math.abs(draftDelta) : 0;
              const totalEarnings = legalFigures.grossSalary + totalCredits + draftCredit;
              const totalDeductions = legalFigures.inss + totalDebits + draftDebit;
              const absenceDays = entry.adjustments
                .filter(adjustment => adjustment.kind === 'absence')
                .reduce((sum, adjustment) => sum + (adjustment.quantity || 0), 0);

              return (
                <article className={`${styles.entry} ${expanded ? styles.entryExpanded : ''}`} key={entry.id}>
                  <div className={styles.entrySummary}>
                    <button
                      className={styles.expandButton}
                      aria-label={`${expanded ? 'Ocultar' : 'Abrir'} detalhes e ajustes de ${entry.employeeName}`}
                      aria-expanded={expanded}
                      aria-controls={`payroll-details-${entry.id}`}
                      onClick={() => {
                        setExpandedId(expanded ? null : entry.id);
                        if (isDraftEntry) setAdjustmentDraft(null);
                      }}
                    >
                      <span className="material-symbols-outlined">{expanded ? 'expand_more' : 'chevron_right'}</span>
                      <span className={styles.expandLabel}>Detalhes e ajustes</span>
                    </button>

                    <div className={styles.employeeIdentity}>
                      <span className={styles.avatar}>{initials(entry.employeeName)}</span>
                      <span className={styles.employeeText}>
                        <strong>{entry.employeeName}</strong>
                        <small className={entry.employmentType === 'CLT' ? styles.activeRule : styles.mutedRule}>
                          {entry.employmentType === 'CLT'
                            ? 'Cálculo CLT ativo'
                            : entry.employmentType === 'PJ'
                              ? 'Sem regras CLT'
                              : 'Regime a definir'}
                          {entry.cargo ? ` · ${entry.cargo}` : ''}
                        </small>
                        <small
                          className={`${styles.paymentBadge} ${
                            entry.paymentStatus === 'paid'
                              ? styles.paymentBadgePaid
                              : entry.paymentStatus === 'review'
                                ? styles.paymentBadgeReview
                                : styles.paymentBadgePending
                          }`}
                        >
                          <span className="material-symbols-outlined">
                            {entry.paymentStatus === 'paid'
                              ? 'check_circle'
                              : entry.paymentStatus === 'review'
                                ? 'error'
                                : 'schedule'}
                          </span>
                          {entry.paymentStatus === 'paid'
                            ? entry.paymentDate
                              ? `Pago em ${formatPaymentDate(entry.paymentDate)}`
                              : 'Pagamento confirmado'
                            : entry.paymentStatus === 'review'
                              ? 'Pagamento em revisão'
                              : 'Pagamento pendente'}
                        </small>
                      </span>
                    </div>

                    <div className={styles.regimeCell}>
                      <span className={styles.mobileLabel}>Regime</span>
                      <select
                        aria-label={`Regime de ${entry.employeeName}`}
                        className={`${styles.regimeSelect} ${entry.employmentType ? '' : styles.regimeUndefined}`}
                        value={entry.employmentType || ''}
                        disabled={busyKey === `regime:${entry.id}`}
                        onChange={event => void updateRegime(entry, (event.target.value || null) as EmploymentType)}
                      >
                        <option value="">Definir</option>
                        <option value="CLT">CLT</option>
                        <option value="PJ">PJ</option>
                      </select>
                    </div>

                    <div className={styles.salaryCell}>
                      <span className={styles.mobileLabel}>Salário-base</span>
                      <span className={styles.salaryValues}>
                        <strong>{formatCurrency(legalFigures.baseSalary)}</strong>
                        {legalFigures.hazardPay > 0 && <small>+ {formatCurrency(legalFigures.hazardPay)} insal.</small>}
                      </span>
                    </div>

                    <div className={styles.adjustmentCell}>
                      <span className={styles.mobileLabel}>Ajustes</span>
                      {totalCredits > 0 && <span className={styles.credit}>+ {formatCurrency(totalCredits)}</span>}
                      {totalDebits > 0 && <span className={styles.debit}>− {formatCurrency(totalDebits)}</span>}
                      {totalCredits === 0 && totalDebits === 0 && <span className={styles.mutedValue}>—</span>}
                    </div>

                    <div className={styles.absenceCell}>
                      <span className={styles.mobileLabel}>Faltas</span>
                      <span>{absenceDays || 0} {absenceDays === 1 ? 'dia' : absenceDays > 1 ? 'dias' : ''}</span>
                    </div>

                    <div className={styles.totalCell}>
                      <span className={styles.mobileLabel}>Líquido</span>
                      <strong>{formatCurrency(total)}</strong>
                    </div>

                    <div className={styles.rowActions}>
                      <button aria-label={`Editar ${entry.employeeName}`} onClick={() => openEditEmployee(entry)}>
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button
                        aria-label={`Remover ${entry.employeeName}`}
                        disabled={busyKey === `delete:${entry.id}`}
                        onClick={() => void deleteEmployee(entry)}
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className={styles.expandedPanel} id={`payroll-details-${entry.id}`}>
                      <div className={`${styles.paymentStatusBar} ${
                        entry.paymentStatus === 'paid'
                          ? styles.paymentStatusPaid
                          : entry.paymentStatus === 'review'
                            ? styles.paymentStatusReview
                            : styles.paymentStatusPending
                      }`}>
                        <div className={styles.paymentStatusDetails}>
                          <span className={`${styles.paymentStatusIcon} material-symbols-outlined`}>
                            {entry.paymentStatus === 'paid'
                              ? 'check_circle'
                              : entry.paymentStatus === 'review'
                                ? 'error'
                                : 'schedule'}
                          </span>
                          <span>
                            <strong>
                              {entry.paymentStatus === 'paid'
                                ? 'Pagamento confirmado'
                                : entry.paymentStatus === 'review'
                                  ? 'Pagamento em revisão'
                                  : 'Pagamento pendente'}
                            </strong>
                            <small>
                              {entry.paymentStatus === 'paid'
                                ? entry.paymentDate
                                  ? `Confirmado em ${formatPaymentDate(entry.paymentDate, true)}`
                                  : 'Confirmado sem data registrada.'
                                : entry.paymentStatus === 'review'
                                  ? 'Confira os dados antes de confirmar o pagamento.'
                                  : 'Ainda não confirmado nesta competência.'}
                            </small>
                          </span>
                        </div>
                        <button
                          className={entry.paymentStatus === 'paid' ? styles.undoPaymentButton : styles.confirmPaymentButton}
                          disabled={busyKey === `payment:${entry.id}`}
                          aria-busy={busyKey === `payment:${entry.id}`}
                          aria-label={`${entry.paymentStatus === 'paid' ? 'Desfazer pagamento' : 'Confirmar pagamento'} de ${entry.employeeName}`}
                          onClick={() => void togglePayment(entry)}
                        >
                          <span className="material-symbols-outlined">
                            {busyKey === `payment:${entry.id}`
                              ? 'progress_activity'
                              : entry.paymentStatus === 'paid'
                                ? 'undo'
                                : 'check'}
                          </span>
                          {busyKey === `payment:${entry.id}`
                            ? 'Atualizando...'
                            : entry.paymentStatus === 'paid'
                              ? 'Desfazer pagamento'
                              : 'Confirmar pagamento'}
                        </button>
                      </div>

                      <div className={styles.paymentOverview}>
                        <div>
                          <span>Total rendimentos</span>
                          <strong className={styles.credit}>{formatCurrency(totalEarnings)}</strong>
                          <small>Salário, adicional e créditos</small>
                        </div>
                        <div>
                          <span>Total descontos</span>
                          <strong className={styles.debit}>{formatCurrency(totalDeductions)}</strong>
                          <small>INSS e demais débitos</small>
                        </div>
                        <div className={styles.netOverview}>
                          <span>Líquido estimado</span>
                          <strong>{formatCurrency(total)}</strong>
                          <small>Valor previsto ao colaborador</small>
                        </div>
                        <div>
                          <span>FGTS do período</span>
                          <strong>{entry.employmentType === 'CLT' && entry.hasFgts ? formatCurrency(legalFigures.fgts) : 'Não se aplica'}</strong>
                          <small>{entry.employmentType === 'CLT' && entry.hasFgts ? `Base ${formatCurrency(legalFigures.grossSalary)}` : 'Sem incidência'}</small>
                        </div>
                      </div>

                      <div className={styles.breakdownGrid}>
                        <section className={styles.breakdownSection}>
                          <header>
                            <span className="material-symbols-outlined">trending_up</span>
                            Rendimentos
                          </header>
                          <div className={styles.breakdownRow}>
                            <span><strong>Salário-base</strong><small>30 dias</small></span>
                            <strong>{formatCurrency(legalFigures.baseSalary)}</strong>
                          </div>
                          {legalFigures.hazardPay > 0 && (
                            <div className={styles.breakdownRow}>
                              <span>
                                <strong>Insalubridade · {legalFigures.hazardPayRate}%</strong>
                                <small>Base {formatCurrency(legalFigures.hazardPayBase)}</small>
                              </span>
                              <strong>{formatCurrency(legalFigures.hazardPay)}</strong>
                            </div>
                          )}
                          {(entry.bonus || 0) > 0 && (
                            <div className={styles.breakdownRow}>
                              <span><strong>Prêmio produtividade</strong><small>Crédito desta competência</small></span>
                              <strong>{formatCurrency(entry.bonus || 0)}</strong>
                            </div>
                          )}
                          {creditAdjustments.map(adjustment => (
                            <div className={styles.breakdownRow} key={adjustment.id}>
                              <span>
                                <strong>{adjustment.label || PAYROLL_ADJUSTMENT_KINDS[adjustment.kind]?.label || 'Acréscimo'}</strong>
                                <small>{adjustment.kind === 'absence' ? adjustmentDisplay(entry, adjustment) : 'Crédito do mês'}</small>
                              </span>
                              <strong>{formatCurrency(calculateAdjustmentValue(legalFigures.baseSalary, entry.employmentType, adjustment))}</strong>
                              <button
                                aria-label={`Remover ${adjustment.label || 'acréscimo'}`}
                                disabled={busyKey === `adjustment:${adjustment.id}`}
                                onClick={() => void deleteAdjustment(adjustment)}
                              >
                                <span className="material-symbols-outlined">delete</span>
                              </button>
                            </div>
                          ))}
                        </section>

                        <section className={styles.breakdownSection}>
                          <header>
                            <span className="material-symbols-outlined">trending_down</span>
                            Descontos
                          </header>
                          {entry.employmentType === 'CLT' && (
                            <div className={styles.breakdownRow}>
                              <span><strong>INSS sobre salários</strong><small>Base {formatCurrency(legalFigures.grossSalary)}</small></span>
                              <strong>{formatCurrency(legalFigures.inss)}</strong>
                            </div>
                          )}
                          {debitAdjustments.map(adjustment => (
                            <div className={styles.breakdownRow} key={adjustment.id}>
                              <span>
                                <strong>{adjustment.label || PAYROLL_ADJUSTMENT_KINDS[adjustment.kind]?.label || 'Desconto'}</strong>
                                <small>{adjustment.kind === 'absence' ? adjustmentDisplay(entry, adjustment) : 'Desconto do mês'}</small>
                              </span>
                              <strong>{formatCurrency(calculateAdjustmentValue(legalFigures.baseSalary, entry.employmentType, adjustment))}</strong>
                              <button
                                aria-label={`Remover ${adjustment.label || 'desconto'}`}
                                disabled={busyKey === `adjustment:${adjustment.id}`}
                                onClick={() => void deleteAdjustment(adjustment)}
                              >
                                <span className="material-symbols-outlined">delete</span>
                              </button>
                            </div>
                          ))}
                          {entry.employmentType !== 'CLT' && debitAdjustments.length === 0 && (
                            <div className={styles.emptyBreakdown}>Nenhum desconto lançado</div>
                          )}
                        </section>
                      </div>

                      {isDraftEntry && adjustmentDraft ? (
                        <div className={styles.adjustmentEditor}>
                          <label>
                            <span>Tipo</span>
                            <select value={adjustmentDraft.kind} onChange={event => changeAdjustmentKind(event.target.value as PayrollAdjustmentKind)}>
                              {ADJUSTMENT_ORDER.filter(kind => kind !== 'absence' || entry.employmentType === 'CLT').map(kind => (
                                <option key={kind} value={kind}>{PAYROLL_ADJUSTMENT_KINDS[kind].label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Natureza</span>
                            <select
                              value={adjustmentDraft.direction}
                              disabled={adjustmentDraft.kind !== 'other'}
                              onChange={event => setAdjustmentDraft({ ...adjustmentDraft, direction: event.target.value as PayrollAdjustmentDirection })}
                            >
                              <option value="credit">Acréscimo</option>
                              <option value="debit">Desconto</option>
                            </select>
                          </label>
                          {adjustmentDraft.kind === 'other' && (
                            <label>
                              <span>Descrição</span>
                              <input
                                maxLength={80}
                                placeholder="Ex: Bonificação"
                                value={adjustmentDraft.label}
                                onChange={event => setAdjustmentDraft({ ...adjustmentDraft, label: event.target.value })}
                              />
                            </label>
                          )}
                          <label>
                            <span>{draftConfig?.input === 'days' ? 'Quantidade' : 'Valor'}</span>
                            <div className={styles.valueInput}>
                              <span>{draftConfig?.input === 'days' ? 'dias' : 'R$'}</span>
                              <input
                                autoFocus
                                inputMode="numeric"
                                min="0"
                                step={draftConfig?.input === 'days' ? '1' : '0.01'}
                                type={draftConfig?.input === 'days' ? 'number' : 'text'}
                                placeholder="0"
                                value={adjustmentDraft.value}
                                onChange={event => setAdjustmentDraft({
                                  ...adjustmentDraft,
                                  value: draftConfig?.input === 'currency'
                                    ? formatCurrencyInputFromTyping(event.target.value)
                                    : event.target.value,
                                })}
                              />
                            </div>
                          </label>
                          <div className={styles.editorActions}>
                            <button className={styles.cancelButton} onClick={() => setAdjustmentDraft(null)}>Cancelar</button>
                            <button className={styles.primaryButton} disabled={busyKey === 'adjustment'} onClick={() => void saveAdjustment()}>
                              {busyKey === 'adjustment' ? 'Salvando...' : 'Adicionar ajuste'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className={styles.addAdjustmentButton}
                          disabled={!entry.employmentType}
                          title={!entry.employmentType ? 'Defina o regime primeiro' : undefined}
                          onClick={() => startAdjustment(entry)}
                        >
                          <span className="material-symbols-outlined">add</span>
                          Adicionar desconto ou acréscimo
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div className={styles.footerActions}>
          <button className={styles.secondaryButton} onClick={openNewEmployee}>
            <span className="material-symbols-outlined">add</span>
            Adicionar colaborador
          </button>
          <button className={styles.primaryButton} onClick={() => void saveSheet()}>
            <span className="material-symbols-outlined">save</span>
            Salvar folha
          </button>
        </div>
      )}

      {employeeForm && (
        <div className={styles.modalOverlay} onMouseDown={event => event.target === event.currentTarget && setEmployeeForm(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="employee-form-title">
            <div className={styles.modalHeader}>
              <div>
                <h2 id="employee-form-title">{employeeForm.id ? 'Editar colaborador' : 'Adicionar colaborador'}</h2>
                <p>{employeeForm.id ? 'Atualize os dados desta competência.' : 'O cadastro será repetido nas próximas competências.'}</p>
              </div>
              <button aria-label="Fechar" onClick={() => setEmployeeForm(null)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.modalFields}>
              <label>
                <span>Nome do colaborador</span>
                <input autoFocus value={employeeForm.employeeName} onChange={event => setEmployeeForm({ ...employeeForm, employeeName: event.target.value })} placeholder="Nome completo" />
              </label>
              <label>
                <span>Cargo / profissão</span>
                <input value={employeeForm.cargo} onChange={event => setEmployeeForm({ ...employeeForm, cargo: event.target.value })} placeholder="Ex: Esteticista" />
              </label>
              <div className={styles.twoColumns}>
                <label>
                  <span>Regime</span>
                  <select
                    value={employeeForm.employmentType || ''}
                    onChange={event => {
                      const employmentType = (event.target.value || null) as EmploymentType;
                      setEmployeeForm({
                        ...employeeForm,
                        employmentType,
                        hazardPayRate: employmentType === 'CLT' ? employeeForm.hazardPayRate : 0,
                        transportDiscountEnabled: employmentType === 'CLT' ? employeeForm.transportDiscountEnabled : false,
                      });
                    }}
                  >
                    <option value="">Selecione</option>
                    <option value="CLT">CLT</option>
                    <option value="PJ">PJ</option>
                  </select>
                </label>
                <label>
                  <span>Salário-base</span>
                  <div className={styles.valueInput}>
                    <span>R$</span>
                    <input
                      inputMode="numeric"
                      type="text"
                      value={employeeForm.salary}
                      onChange={event => setEmployeeForm({ ...employeeForm, salary: formatCurrencyInputFromTyping(event.target.value) })}
                      placeholder="0,00"
                    />
                  </div>
                </label>
              </div>
              <div className={styles.hazardPayFields}>
                <label>
                  <span>Insalubridade</span>
                  <select
                    value={employeeForm.employmentType === 'CLT' ? employeeForm.hazardPayRate : 0}
                    disabled={employeeForm.employmentType !== 'CLT'}
                    onChange={event => setEmployeeForm({ ...employeeForm, hazardPayRate: Number(event.target.value) as HazardPayRate })}
                  >
                    {HAZARD_PAY_RATES.map(rate => (
                      <option key={rate} value={rate}>{rate === 0 ? 'Não se aplica' : `${rate}%`}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Base da insalubridade</span>
                  <div className={styles.valueInput}>
                    <span>R$</span>
                    <input
                      inputMode="numeric"
                      type="text"
                      disabled={employeeForm.employmentType !== 'CLT' || employeeForm.hazardPayRate === 0}
                      value={employeeForm.hazardPayBase}
                      onChange={event => setEmployeeForm({ ...employeeForm, hazardPayBase: formatCurrencyInputFromTyping(event.target.value) })}
                      placeholder="1.621,00"
                    />
                  </div>
                </label>
              </div>
              <div className={styles.compensationFields}>
                <label>
                  <span>Prêmio desta competência</span>
                  <div className={styles.valueInput}>
                    <span>R$</span>
                    <input
                      inputMode="numeric"
                      type="text"
                      value={employeeForm.bonus}
                      onChange={event => setEmployeeForm({ ...employeeForm, bonus: formatCurrencyInputFromTyping(event.target.value) })}
                      placeholder="0,00"
                    />
                  </div>
                </label>
                <label className={styles.benefitToggle}>
                  <input
                    type="checkbox"
                    checked={employeeForm.transportDiscountEnabled}
                    disabled={employeeForm.employmentType !== 'CLT'}
                    onChange={event => setEmployeeForm({ ...employeeForm, transportDiscountEnabled: event.target.checked })}
                  />
                  <span>
                    <strong>Descontar vale-transporte</strong>
                    <small>
                      6% do salário-base · {formatCurrency(calculateAutomaticTransportDiscount(parseCurrencyInput(employeeForm.salary)))}
                    </small>
                  </span>
                </label>
              </div>
              {!employeeForm.id && selectedUnit === 'all' && (
                <label>
                  <span>Unidade</span>
                  <select value={employeeForm.unit} onChange={event => setEmployeeForm({ ...employeeForm, unit: event.target.value })}>
                    {UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </label>
              )}
              <div className={styles.ruleNote}>
                <span className="material-symbols-outlined">info</span>
                {employeeForm.employmentType === 'CLT'
                  ? employeeForm.hazardPayRate > 0
                    ? 'A insalubridade entra no bruto e nas bases estimadas de INSS e FGTS. O vale-transporte, quando marcado, usa somente 6% do salário-base.'
                    : 'Insalubridade não contabilizada. Faltas usam salário-base ÷ 30 e o vale-transporte marcado usa somente 6% do salário-base.'
                  : employeeForm.employmentType === 'PJ'
                    ? 'PJ utiliza somente ajustes monetários manuais.'
                    : 'Escolha o regime para aplicar a regra correta.'}
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setEmployeeForm(null)}>Cancelar</button>
              <button className={styles.primaryButton} disabled={busyKey === 'employee'} onClick={() => void saveEmployee()}>
                {busyKey === 'employee' ? 'Salvando...' : 'Salvar colaborador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
