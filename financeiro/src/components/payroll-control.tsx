'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/currency';
import {
  PAYROLL_ADJUSTMENT_KINDS,
  calculateAdjustmentDelta,
  calculateAdjustmentValue,
  calculatePayrollTotal,
} from '@/lib/payroll-adjustments';
import type {
  EmploymentType,
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
  onRefresh: () => Promise<void>;
}

interface EmployeeFormState {
  id?: string;
  employeeName: string;
  salary: string;
  employmentType: EmploymentType;
  unit: string;
}

interface AdjustmentDraft {
  payrollEntryId: string;
  kind: PayrollAdjustmentKind;
  direction: PayrollAdjustmentDirection;
  value: string;
  label: string;
}

const UNITS = ['Osasco', 'SBC', 'SCS'];
const ADJUSTMENT_ORDER: PayrollAdjustmentKind[] = ['absence', 'award', 'advance', 'discount', 'addition', 'other'];

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

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação');
  return data;
}

function adjustmentDisplay(entry: PayrollEntryData, adjustment: PayrollAdjustmentData) {
  const value = calculateAdjustmentValue(entry.netSalary, entry.employmentType, adjustment);
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
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentDraft | null>(null);
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => {
    if (entries.length === 0) {
      setExpandedId(null);
      return;
    }
    if (expandedId && entries.some(entry => entry.id === expandedId)) return;
    setExpandedId(entries[0].id);
  }, [entries, expandedId]);

  const draftEntry = adjustmentDraft
    ? entries.find(entry => entry.id === adjustmentDraft.payrollEntryId)
    : undefined;
  const draftConfig = adjustmentDraft ? PAYROLL_ADJUSTMENT_KINDS[adjustmentDraft.kind] : null;
  const draftValue = adjustmentDraft ? toNumber(adjustmentDraft.value) : 0;
  const draftDelta = draftEntry && adjustmentDraft && draftValue > 0
    ? calculateAdjustmentDelta(draftEntry.netSalary, draftEntry.employmentType, {
        kind: adjustmentDraft.kind,
        direction: adjustmentDraft.direction,
        quantity: draftConfig?.input === 'days' ? draftValue : null,
        amount: draftConfig?.input === 'currency' ? draftValue : null,
      })
    : 0;

  const displayedPayrollTotal = summary.totalPayroll + draftDelta;
  const hasUndefinedRegime = summary.undefinedRegimeCount > 0;

  const openNewEmployee = () => {
    setEmployeeForm({
      employeeName: '',
      salary: '',
      employmentType: null,
      unit: selectedUnit === 'all' ? 'Osasco' : selectedUnit,
    });
  };

  const openEditEmployee = (entry: PayrollEntryData) => {
    setEmployeeForm({
      id: entry.id,
      employeeName: entry.employeeName,
      salary: String(entry.netSalary).replace('.', ','),
      employmentType: entry.employmentType,
      unit: selectedUnit === 'all' ? 'Osasco' : selectedUnit,
    });
  };

  const saveEmployee = async () => {
    if (!employeeForm) return;
    const salary = toNumber(employeeForm.salary);
    if (!employeeForm.employeeName.trim()) return toast('Informe o nome do colaborador', 'warning');
    if (!employeeForm.employmentType) return toast('Escolha o regime CLT ou PJ', 'warning');
    if (salary <= 0) return toast('Informe um salário maior que zero', 'warning');

    setBusyKey('employee');
    try {
      const isEditing = Boolean(employeeForm.id);
      const response = await fetch('/api/payroll/entries', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEditing ? { id: employeeForm.id } : {}),
          employeeName: employeeForm.employeeName.trim(),
          netSalary: salary,
          baseSalary: salary,
          employmentType: employeeForm.employmentType,
          ...(!isEditing ? {
            unit: employeeForm.unit,
            competenceMonth,
            competenceYear,
            isRecurring: true,
          } : {}),
        }),
      });
      await parseResponse(response);
      await onRefresh();
      setEmployeeForm(null);
      toast(isEditing ? 'Colaborador atualizado' : 'Colaborador adicionado', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Erro ao salvar colaborador', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const updateRegime = async (entry: PayrollEntryData, employmentType: EmploymentType) => {
    setBusyKey(`regime:${entry.id}`);
    try {
      const response = await fetch('/api/payroll/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, employmentType }),
      });
      await parseResponse(response);
      await onRefresh();
      toast('Regime atualizado', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Erro ao atualizar regime', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const deleteEmployee = async (entry: PayrollEntryData) => {
    const confirmed = await confirmDialog({
      title: 'Remover colaborador',
      message: `Remover ${entry.employeeName} desta competência? Os ajustes vinculados também serão removidos.`,
      confirmText: 'Remover',
      variant: 'danger',
    });
    if (!confirmed) return;

    setBusyKey(`delete:${entry.id}`);
    try {
      const response = await fetch(`/api/payroll/entries?id=${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      await parseResponse(response);
      await onRefresh();
      toast('Colaborador removido', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Erro ao remover colaborador', 'error');
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
    if (!draftEntry.employmentType) return toast('Defina o regime antes de adicionar ajustes', 'warning');
    if (draftValue <= 0) return toast('Informe um valor maior que zero', 'warning');

    setBusyKey('adjustment');
    try {
      const response = await fetch('/api/payroll/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollEntryId: adjustmentDraft.payrollEntryId,
          kind: adjustmentDraft.kind,
          direction: adjustmentDraft.direction,
          label: adjustmentDraft.label,
          quantity: draftConfig.input === 'days' ? draftValue : null,
          amount: draftConfig.input === 'currency' ? draftValue : null,
        }),
      });
      await parseResponse(response);
      await onRefresh();
      setAdjustmentDraft(null);
      toast('Ajuste adicionado', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Erro ao adicionar ajuste', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const deleteAdjustment = async (adjustment: PayrollAdjustmentData) => {
    setBusyKey(`adjustment:${adjustment.id}`);
    try {
      const response = await fetch(`/api/payroll/adjustments?id=${encodeURIComponent(adjustment.id)}`, { method: 'DELETE' });
      await parseResponse(response);
      await onRefresh();
      toast('Ajuste removido', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Erro ao remover ajuste', 'error');
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
          <span>Salário</span>
          <span>Ajustes</span>
          <span>Faltas</span>
          <span>Total</span>
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
              const total = persistedTotal + (isDraftEntry ? draftDelta : 0);
              const totalCredits = entry.adjustments
                .filter(adjustment => adjustment.direction === 'credit')
                .reduce((sum, adjustment) => sum + calculateAdjustmentValue(entry.netSalary, entry.employmentType, adjustment), 0);
              const totalDebits = entry.adjustments
                .filter(adjustment => adjustment.direction === 'debit')
                .reduce((sum, adjustment) => sum + calculateAdjustmentValue(entry.netSalary, entry.employmentType, adjustment), 0);
              const absenceDays = entry.adjustments
                .filter(adjustment => adjustment.kind === 'absence')
                .reduce((sum, adjustment) => sum + (adjustment.quantity || 0), 0);

              return (
                <article className={`${styles.entry} ${expanded ? styles.entryExpanded : ''}`} key={entry.id}>
                  <div className={styles.entrySummary}>
                    <button
                      className={styles.expandButton}
                      aria-label={expanded ? 'Recolher colaborador' : 'Expandir colaborador'}
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedId(expanded ? null : entry.id);
                        if (isDraftEntry) setAdjustmentDraft(null);
                      }}
                    >
                      <span className="material-symbols-outlined">{expanded ? 'expand_more' : 'chevron_right'}</span>
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
                      <span className={styles.mobileLabel}>Salário</span>
                      <strong>{formatCurrency(entry.netSalary)}</strong>
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
                      <span className={styles.mobileLabel}>Total</span>
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
                    <div className={styles.expandedPanel}>
                      {entry.adjustments.length > 0 && (
                        <div className={styles.adjustmentList}>
                          {entry.adjustments.map(adjustment => {
                            const value = calculateAdjustmentValue(entry.netSalary, entry.employmentType, adjustment);
                            return (
                              <div className={styles.savedAdjustment} key={adjustment.id}>
                                <span className={`${styles.adjustmentKindIcon} ${adjustment.direction === 'credit' ? styles.creditIcon : styles.debitIcon}`}>
                                  <span className="material-symbols-outlined">
                                    {adjustment.kind === 'absence' ? 'event_busy' : adjustment.direction === 'credit' ? 'add' : 'remove'}
                                  </span>
                                </span>
                                <span className={styles.savedAdjustmentText}>
                                  <strong>{adjustment.label || PAYROLL_ADJUSTMENT_KINDS[adjustment.kind].label}</strong>
                                  <small>{adjustmentDisplay(entry, adjustment)}</small>
                                </span>
                                <strong className={adjustment.direction === 'credit' ? styles.credit : styles.debit}>
                                  {adjustment.direction === 'credit' ? '+' : '−'} {formatCurrency(value)}
                                </strong>
                                <button
                                  aria-label="Remover ajuste"
                                  disabled={busyKey === `adjustment:${adjustment.id}`}
                                  onClick={() => void deleteAdjustment(adjustment)}
                                >
                                  <span className="material-symbols-outlined">delete</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

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
                                inputMode={draftConfig?.input === 'days' ? 'numeric' : 'decimal'}
                                min="0"
                                step={draftConfig?.input === 'days' ? '1' : '0.01'}
                                type="number"
                                placeholder="0"
                                value={adjustmentDraft.value}
                                onChange={event => setAdjustmentDraft({ ...adjustmentDraft, value: event.target.value })}
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
              <div className={styles.twoColumns}>
                <label>
                  <span>Regime</span>
                  <select value={employeeForm.employmentType || ''} onChange={event => setEmployeeForm({ ...employeeForm, employmentType: (event.target.value || null) as EmploymentType })}>
                    <option value="">Selecione</option>
                    <option value="CLT">CLT</option>
                    <option value="PJ">PJ</option>
                  </select>
                </label>
                <label>
                  <span>Salário</span>
                  <div className={styles.valueInput}>
                    <span>R$</span>
                    <input inputMode="decimal" type="number" min="0" step="0.01" value={employeeForm.salary} onChange={event => setEmployeeForm({ ...employeeForm, salary: event.target.value })} placeholder="0,00" />
                  </div>
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
                  ? 'Faltas serão calculadas por salário ÷ 30 × dias.'
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
