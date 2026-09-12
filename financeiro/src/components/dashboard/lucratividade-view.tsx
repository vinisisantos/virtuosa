import { useMemo } from 'react';
import { fmt, FixedExpense, Bill, LogEntry } from '@/hooks/useDashboard';
import { recurringCostsTotalInMonth } from '@/lib/cost-recurrence';
import { costEntryMatchesMonth } from '@/lib/cost-reference-month';
import { isRevenuePending } from '@/lib/revenue';
import styles from './lucratividade-view.module.css';

export function LucratividadeView({
  d,
  automaticFixedCosts = 0,
  automaticVariableCosts = 0,
}: {
  d: any;
  automaticFixedCosts?: number;
  automaticVariableCosts?: number;
}) {
  const { totalRev, fixedExpenses, bills, logs, selectedUnit, selectedYear, selectedMonth } = d;

  const data = useMemo(() => {
    const receita = totalRev || 0;
    const aReceber = logs
      .filter((entry: LogEntry) => {
        if (!isRevenuePending(entry) || !entry.date) return false;
        if (selectedUnit !== 'all' && entry.unit !== selectedUnit) return false;
        const date = new Date(entry.date);
        return date.getUTCFullYear() === selectedYear && date.getUTCMonth() === selectedMonth;
      })
      .reduce((sum: number, entry: LogEntry) => sum + entry.value, 0);
    
    // Custos Fixos (competência do mês selecionado por padrão)
    const fixed = fixedExpenses.filter((e: FixedExpense) => e.value > 0 && (selectedUnit === 'all' || !e.unit || e.unit === selectedUnit));
    const monthlyBills = bills.filter((b: Bill) => {
      if (selectedUnit !== 'all' && b.unit && b.unit !== selectedUnit) return false;
      if (b.type === 'fixo') return true;
      return costEntryMatchesMonth(b.refMonth, b.dueDateManual, selectedYear, selectedMonth);
    });

    const totalFixed = recurringCostsTotalInMonth(fixed, selectedYear, selectedMonth)
      + monthlyBills.filter((bill: Bill) => bill.type === 'fixo').reduce((sum: number, bill: Bill) => sum + bill.value, 0)
      + automaticFixedCosts;
    const totalVariaveis = monthlyBills.filter((bill: Bill) => bill.type === 'variavel').reduce((sum: number, bill: Bill) => sum + bill.value, 0)
      + automaticVariableCosts;
    const totalCustos = totalFixed + totalVariaveis;
    const lucro = receita - totalCustos;
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;

    return { receita, aReceber, totalFixed, totalVariaveis, totalCustos, lucro, margem };
  }, [automaticFixedCosts, automaticVariableCosts, totalRev, fixedExpenses, bills, logs, selectedUnit, selectedYear, selectedMonth]);

  const resultColor = data.lucro >= 0 ? '#22c55e' : '#ef4444';
  const marginColor = data.margem >= 15 ? '#22c55e' : data.margem > 0 ? '#f59e0b' : '#ef4444';

  return (
    <section className={styles.root} aria-labelledby="dre-summary-title">
      <div className={styles.notice}>
        <span className="material-symbols-outlined" aria-hidden="true">info</span>
        <span>
          DRE gerencial mensal: a folha entra no mês seguinte à competência e os pedidos entram na data lançada em Custos, sem presumir que já foram pagos.
        </span>
      </div>

      <div className={styles.kpis} aria-live="polite">
        <article className={styles.kpiCard}>
          <div className={styles.kpiLabel}><span className="material-symbols-outlined" style={{ color: '#3b82f6' }} aria-hidden="true">trending_up</span>Receita realizada</div>
          <div className={styles.kpiValue}>{fmt(data.receita)}</div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiLabel}><span className="material-symbols-outlined" style={{ color: '#f59e0b' }} aria-hidden="true">schedule</span>A receber</div>
          <div className={styles.kpiValue}>{fmt(data.aReceber)}</div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiLabel}><span className="material-symbols-outlined" style={{ color: '#ef4444' }} aria-hidden="true">trending_down</span>Custos operacionais</div>
          <div className={styles.kpiValue}>{fmt(data.totalCustos)}</div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiLabel}><span className="material-symbols-outlined" style={{ color: resultColor }} aria-hidden="true">account_balance</span>Resultado gerencial</div>
          <div className={styles.kpiValue} style={{ color: resultColor }}>{fmt(data.lucro)}</div>
        </article>
      </div>

      <article className={styles.statement} aria-live="polite">
        <h2 id="dre-summary-title">DRE gerencial do mês</h2>

        <div className={styles.statementRows}>
          <div className={styles.statementRow}>
            <span className={styles.revenueLabel}>(+) Receitas realizadas</span>
            <strong className={styles.revenueValue}>{fmt(data.receita)}</strong>
          </div>
          <div className={styles.statementRow}>
            <span className={styles.pendingLabel}>(i) Receitas a receber (fora do resultado)</span>
            <strong className={styles.pendingValue}>{fmt(data.aReceber)}</strong>
          </div>
          <div className={styles.statementRow}>
            <span>(-) Custos fixos</span>
            <strong>{fmt(data.totalFixed)}</strong>
          </div>
          <div className={`${styles.statementRow} ${styles.lastCostRow}`}>
            <span>(-) Custos variáveis</span>
            <strong>{fmt(data.totalVariaveis)}</strong>
          </div>

          <div className={styles.resultRow}>
            <strong>(=) Resultado gerencial</strong>
            <div className={styles.resultValue}>
              <strong style={{ color: resultColor }}>{fmt(data.lucro)}</strong>
              <span>Margem: <b style={{ color: marginColor }}>{data.margem.toFixed(1)}%</b></span>
            </div>
          </div>
        </div>

        <div className={styles.progress} aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, 100 - data.margem))}%` }} />
          <span style={{ width: `${Math.max(0, Math.min(100, data.margem))}%` }} />
        </div>
        <div className={styles.progressLegend}>
          <span>Custos consumidos</span>
          <span>Lucro gerado</span>
        </div>
      </article>
    </section>
  );
}
