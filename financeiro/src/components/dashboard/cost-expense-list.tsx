'use client';

import { useMemo, useState } from 'react';
import type { CostRow } from './custos-unificado';
import type { Bill, FixedExpense } from '@/hooks/useDashboard';
import { fmt } from '@/hooks/useDashboard';
import { automaticExpenseGroupKey, groupExpenseRows, groupingCandidates, type ManualCostReference } from '@/lib/cost-expense-groups';
import { recurringCostOccurrencesInMonth } from '@/lib/cost-recurrence';
import styles from './cost-expense-list.module.css';

const shortDate = (date: string) => date ? date.split('-').reverse().join('/') : 'Sem data';
const targetKey = (target: ManualCostReference) => `${target.source}:${target.id}`;

export function AutomaticCostGroupingNotice({ fixed, bills, month, unit, category, value }: {
  fixed: FixedExpense[]; bills: Bill[]; month: string; unit: string; category: string; value: number;
}) {
  const candidates = useMemo(() => groupingCandidates({ fixed, bills }, month, unit, category), [fixed, bills, month, unit, category]);
  const key = automaticExpenseGroupKey(unit, category, month);
  const currentTotal = candidates.find(candidate => candidate.key === key)?.total || 0;
  const nextTotal = (Math.round(currentTotal * 100) + Math.round(Math.max(0, value) * 100)) / 100;
  return <div className={styles.picker} data-testid="cost-automatic-grouping">
    <strong>Agrupamento automático · {unit}</strong>
    <p>{category} · {month.split('-').reverse().join('/')} — lançamentos de dias diferentes ficam no mesmo grupo, com suas datas e pagamentos preservados.</p>
    <p>Acumulado: {fmt(currentTotal)}{value > 0 && <> · Com este lançamento: <b>{fmt(nextTotal)}</b></>}</p>
  </div>;
}

export function CostGroupingPicker({ fixed, bills, month, unit, category, selection, disabled, onChange }: {
  fixed: FixedExpense[]; bills: Bill[]; month: string; unit: string; category: string;
  selection: string | null; disabled: boolean; onChange: (selection: string | null) => void;
}) {
  const candidates = useMemo(() => groupingCandidates({ fixed, bills }, month, unit, category), [fixed, bills, month, unit, category]);
  return <fieldset className={styles.picker} disabled={disabled}>
    <label className={styles.toggle}>
      <input type="checkbox" checked={selection !== null} onChange={event => onChange(event.target.checked ? '' : null)} />
      <span><strong>Agrupar com despesa existente</strong><small>Some este lançamento ao grupo, sem alterar os anteriores.</small></span>
    </label>
    {selection !== null && <>
      <label htmlFor="cost-group-target">Adicionar ao gasto ou grupo</label>
      <select id="cost-group-target" value={selection} onChange={event => onChange(event.target.value)}>
        <option value="">Selecione uma despesa</option>
        {candidates.map(candidate => <option key={candidate.key} value={targetKey(candidate.target)}>
          {candidate.name} · {fmt(candidate.total)}{candidate.date ? ` · ${shortDate(candidate.date)}` : ''}{candidate.count > 1 ? ` · ${candidate.count} lançamentos` : ''}
        </option>)}
      </select>
      <p>{candidates.length ? 'Apenas despesas da mesma categoria, unidade e referência. Este novo lançamento continuará sendo único.' : 'Nenhuma despesa compatível. Confira a categoria, a unidade e a referência, ou desative o agrupamento.'}</p>
    </>}
    {disabled && <p>Aguarde os dados financeiros carregarem para agrupar.</p>}
  </fieldset>;
}

interface Props {
  rows: CostRow[]; month: string; filtered: boolean; loading: boolean; error?: string | null;
  canEdit: (row: CostRow) => boolean;
  onEdit: (row: CostRow) => void; onDelete: (row: CostRow) => void;
  onTogglePaid: (row: CostRow) => void; onUngroup: (row: CostRow) => void;
}

export function CostExpenseList({ rows, month, filtered, loading, error, canEdit, onEdit, onDelete, onTogglePaid, onUngroup }: Props) {
  const groups = useMemo(() => groupExpenseRows(rows, month), [rows, month]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [year, monthNumber] = month.split('-').map(Number);
  function dates(row: CostRow) {
    if (row.source === 'fixed') return recurringCostOccurrencesInMonth(row.raw, year, monthNumber - 1);
    if (row.raw.dueDateManual) return [row.raw.dueDateManual as string];
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return [`${month}-${String(Math.min(row.raw.dueDay || 1, lastDay)).padStart(2, '0')}`];
  }
  function toggle(key: string) {
    setExpanded(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function actions(row: CostRow, grouped: boolean) {
    return <div className={styles.actions}>
      {canEdit(row) && <button type="button" disabled={loading || Boolean(error)} onClick={() => onEdit(row)} aria-label={`Editar ${row.name}`} title="Editar"><span className="material-symbols-outlined">edit</span></button>}
      {row.source === 'bill' && <button type="button" disabled={loading || Boolean(error)} onClick={() => onTogglePaid(row)} aria-label={`${row.isPaid ? 'Desfazer pagamento de' : 'Marcar como pago:'} ${row.name}`} title={row.isPaid ? 'Desfazer pagamento' : 'Marcar como pago'}><span className="material-symbols-outlined">{row.isPaid ? 'undo' : 'check'}</span></button>}
      {(grouped || (automaticExpenseGroupKey(row.raw.unit, row.category, month) && row.raw.expenseGroupExclusions?.includes(month))) && <button type="button" disabled={loading || Boolean(error)} onClick={() => onUngroup(row)} aria-label={`${grouped ? 'Desagrupar' : 'Reagrupar'} ${row.name}`} title={grouped ? 'Retirar do grupo, mantendo a despesa' : 'Voltar ao grupo automático da categoria'}><span className="material-symbols-outlined">{grouped ? 'link_off' : 'link'}</span></button>}
      {!row.isHistorical && <button type="button" disabled={loading || Boolean(error)} onClick={() => onDelete(row)} aria-label={`Excluir ${row.name}`} title="Excluir"><span className="material-symbols-outlined">delete</span></button>}
    </div>;
  }
  return <section className={styles.list} aria-label="Despesas manuais">
    <div className={styles.heading}><h2>Despesas manuais</h2><span>{rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}</span></div>
    {error && <p role="alert" className={styles.notice}>{error} As alterações ficam indisponíveis até atualizar os dados.</p>}
    {loading && <p role="status" className={styles.notice}>Carregando despesas…</p>}
    {!loading && !error && groups.length === 0 && <p className={styles.notice}>Nenhuma despesa manual neste período e filtro.</p>}
    {groups.map(group => {
      const first = group.rows[0];
      const isExpanded = expanded.has(group.key);
      const paid = group.rows.reduce((sum, row) => sum + row.paidPortion, 0);
      const pending = group.rows.reduce((sum, row) => sum + row.pendingPortion, 0);
      const status = paid > 0 && pending > 0 ? 'Parcial' : pending > 0 ? 'Pendente' : 'Pago';
      const ordered = [...group.rows].sort((a, b) => (dates(a)[0] || '').localeCompare(dates(b)[0] || ''));
      return <article key={group.key} className={styles.card} data-cost-group={group.grouped ? 'true' : 'false'}>
        {group.grouped ? <>
          <button type="button" className={styles.groupButton} aria-expanded={isExpanded} onClick={() => toggle(group.key)}>
            <span className={styles.groupTitle}><span className={styles.badge}>{automaticExpenseGroupKey(first.raw.unit, first.category, month) ? 'Categoria' : 'Grupo'} · {first.raw.unit}</span><strong>{first.category}</strong><small>{group.rows.length} {group.rows.length === 1 ? 'lançamento' : 'lançamentos'} · {status}{filtered ? ' · filtro aplicado' : ''}</small></span>
            <span className={styles.groupValue}><small>{filtered ? 'Total no filtro' : 'Total acumulado'}</small><strong>{fmt(group.total)}</strong></span>
            <span className="material-symbols-outlined" aria-hidden="true">{isExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>
          {isExpanded && <div className={styles.details}>
            <p className={styles.groupSummary}>Pago {fmt(paid)} · Pendente {fmt(pending)}</p>
            {ordered.map(row => <div className={styles.entry} key={`${row.source}:${row.id}`}>
              <div className={styles.description}><strong>{row.name}</strong><small>{row.recurrence === 'once' ? 'Único' : row.recurrence === 'weekly' ? 'Fixo semanal' : 'Fixo mensal'} · {row.isPaid ? 'Pago' : 'Pendente'}</small>
                {dates(row).map(date => <span className={styles.day} key={date}><time dateTime={date}>{shortDate(date)}</time><b>{fmt(row.value)}</b></span>)}
              </div>
              <div className={styles.entryValue}>{fmt(row.periodTotal)}</div>
              {row.raw.unit === 'SBC' && row.raw.obs && <p className={styles.entryNote}>{row.raw.obs}</p>}
              {actions(row, true)}
            </div>)}
          </div>}
        </> : <div className={styles.single}>
          <div className={styles.description}><strong>{first.name}</strong><small>{first.category} · {first.raw.unit || 'Unidade não informada'} · {first.recurrence === 'once' ? 'Único' : first.recurrence === 'weekly' ? 'Fixo semanal' : 'Fixo mensal'}</small><small>{first.dueInfo} · {status}</small></div>
          <div className={styles.entryValue}>{fmt(first.periodTotal)}{first.occurrenceCount > 1 && <small>{first.occurrenceCount} × {fmt(first.value)}</small>}</div>
          {actions(first, false)}
        </div>}
      </article>;
    })}
  </section>;
}
