'use client';
import { useState, useMemo, useEffect } from 'react';
import { FixedExpense, Bill, fmt, cardS, UNITS, MONTHS, LogEntry } from '@/hooks/useDashboard';
import { DatePicker } from '@/components/ui/date-picker';
import { calcularFolha, DEFAULT_SETTINGS, formatBRL, formatPercent } from '@/lib/payroll-calc';
import type { SmartEmployee, PayrollSettings } from '@/lib/payroll-calc';

interface Props {
  totalRev: number;
  totalCost: number;
  fixedExpenses: FixedExpense[];
  bills: Bill[];
  filteredLogs: { type: string; value: number; date: string; name?: string; unit?: string }[];
  allLogs?: LogEntry[];
  selectedMonth?: number;
  selectedYear?: number;
  selectedUnit?: string;
}

export function FinancialAnalysis({ totalRev, totalCost, fixedExpenses, bills, filteredLogs, allLogs, selectedMonth: propMonth, selectedYear: propYear, selectedUnit: propUnit }: Props) {
  const defaultMonth = propMonth ?? new Date().getMonth();
  const defaultYear = propYear ?? new Date().getFullYear();
  const unitFromProp = propUnit ?? 'all';

  // Period mode
  const [periodMode, setPeriodMode] = useState<'month' | 'custom'>('month');
  const [periodMonths, setPeriodMonths] = useState<number>(1);

  // Custom date range
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedRange, setAppliedRange] = useState<{ startDate: string; endDate: string } | null>(null);

  // Initialize custom range
  useEffect(() => {
    if (!customStart) {
      const y = defaultYear;
      const m = defaultMonth;
      setCustomStart(`${y}-${String(m + 1).padStart(2, '0')}-01`);
      const lastDay = new Date(y, m + 1, 0).getDate();
      setCustomEnd(`${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
    }
  }, [defaultMonth, defaultYear]);

  const isValidDate = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T12:00:00Z');
    return !isNaN(d.getTime()) && d.getUTCFullYear() < 2100 && d.getUTCFullYear() > 2000;
  };

  const handleApplyRange = () => {
    if (customStart && customEnd && customStart <= customEnd && isValidDate(customStart) && isValidDate(customEnd)) {
      setAppliedRange({ startDate: customStart, endDate: customEnd });
    }
  };

  // ─── Compute effective logs based on period mode ───
  const effectiveLogs = useMemo(() => {
    const baseLogs = allLogs || filteredLogs;

    if (periodMode === 'custom' && appliedRange) {
      const startDate = new Date(appliedRange.startDate + 'T00:00:00Z');
      const endDate = new Date(appliedRange.endDate + 'T23:59:59Z');
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return filteredLogs;
      return baseLogs.filter(item => {
        if (!item.date) return false;
        const d = new Date(item.date);
        return d >= startDate && d <= endDate && (unitFromProp === 'all' || (item.unit || '') === unitFromProp);
      });
    }

    if (periodMode === 'month' && periodMonths > 1 && allLogs) {
      const result: typeof filteredLogs = [];
      for (let i = 0; i < periodMonths; i++) {
        let m = defaultMonth - i, y = defaultYear;
        while (m < 0) { m += 12; y--; }
        const mLogs = allLogs.filter(item => {
          if (!item.date) return false;
          const d = new Date(item.date);
          return d.getUTCMonth() === m && d.getUTCFullYear() === y && (unitFromProp === 'all' || (item.unit || '') === unitFromProp);
        });
        result.push(...mLogs);
      }
      return result;
    }

    // Default: use parent-filtered logs (single month)
    return filteredLogs;
  }, [allLogs, filteredLogs, periodMode, periodMonths, appliedRange, defaultMonth, defaultYear, unitFromProp]);

  // ─── Period label ───
  const periodLabel = useMemo(() => {
    if (periodMode === 'custom' && appliedRange) {
      const s = new Date(appliedRange.startDate + 'T12:00:00Z');
      const e = new Date(appliedRange.endDate + 'T12:00:00Z');
      return `${s.toLocaleDateString('pt-BR')} – ${e.toLocaleDateString('pt-BR')}`;
    }
    if (periodMonths === 1) return `${MONTHS[defaultMonth]} ${defaultYear}`;
    let startM = defaultMonth - (periodMonths - 1), startY = defaultYear;
    while (startM < 0) { startM += 12; startY--; }
    return `${MONTHS[startM].substring(0, 3)}/${startY} – ${MONTHS[defaultMonth].substring(0, 3)}/${defaultYear}`;
  }, [periodMode, periodMonths, appliedRange, defaultMonth, defaultYear]);

  // ─── Use effectiveLogs everywhere instead of filteredLogs ───
  const uLogs = effectiveLogs;
  const uFixed = unitFromProp === 'all' ? fixedExpenses : fixedExpenses.filter(e => (e.unit || '') === unitFromProp);
  const uRev = uLogs.filter(l => l.type === 'sale').reduce((s, l) => s + l.value, 0);

  // ─── Pedidos entregues (cost integration) ───
  const [ordersTotal, setOrdersTotal] = useState(0);
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ status: 'Entregue' });
        if (unitFromProp !== 'all') params.append('unit', unitFromProp);
        const res = await fetch(`/api/orders?${params}`);
        if (res.ok) {
          const data = await res.json();
          const total = data.reduce((s: number, o: any) => s + (o.totalPrice || 0), 0);
          setOrdersTotal(total);
        }
      } catch {}
    })();
  }, [unitFromProp]);

  // ─── Folha data from localStorage ───
  const folhaTotal = useMemo(() => {
    try {
      const empRaw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_smart_employees') : null;
      const setRaw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_payroll_settings') : null;
      const employees: SmartEmployee[] = empRaw ? JSON.parse(empRaw) : [];
      const settings: PayrollSettings = setRaw ? JSON.parse(setRaw) : DEFAULT_SETTINGS;
      return employees.filter(e => e.status === 'ativo' && (unitFromProp === 'all' || e.unidade === unitFromProp))
        .reduce((sum, emp) => sum + calcularFolha(emp, settings).custoTotal, 0);
    } catch { return 0; }
  }, [unitFromProp]);

  // ─── Totals ───
  const revForAnalysis = uRev;
  const totalFixed = uFixed.reduce((s, e) => s + e.value, 0);
  const totalBills = bills.reduce((s, b) => s + b.value, 0);
  const totalDespesasVariaveis = uLogs.filter(l => l.type === 'cost').reduce((s, l) => s + l.value, 0);
  const totalDespesas = totalFixed + totalBills + folhaTotal + totalDespesasVariaveis + ordersTotal;

  // ─── KPIs ───
  const faturamentoDisponivel = revForAnalysis - folhaTotal;
  const margemOperacional = revForAnalysis - totalDespesas;
  const margemPct = revForAnalysis > 0 ? (margemOperacional / revForAnalysis) * 100 : 0;
  const indiceCoberturaFolha = revForAnalysis > 0 ? (revForAnalysis / folhaTotal) * 100 : 0;
  const folhaPctFaturamento = revForAnalysis > 0 ? (folhaTotal / revForAnalysis) * 100 : 0;
  const fixosPctFaturamento = revForAnalysis > 0 ? (totalFixed / revForAnalysis) * 100 : 0;
  const despVarPctFaturamento = revForAnalysis > 0 ? (totalDespesasVariaveis / revForAnalysis) * 100 : 0;
  const comprometimentoTotal = revForAnalysis > 0 ? (totalDespesas / revForAnalysis) * 100 : 0;

  // ─── Break-even ───
  const breakEvenDay = useMemo(() => {
    const sales = uLogs.filter(l => l.type === 'sale' && l.date).sort((a, b) => a.date.localeCompare(b.date));
    let acc = 0;
    for (const s of sales) {
      acc += s.value;
      if (acc >= folhaTotal) {
        const d = new Date(s.date);
        return d.getDate();
      }
    }
    return null;
  }, [uLogs, folhaTotal]);

  // ─── Revenue by day accumulation ───
  const dailyAccumulation = useMemo(() => {
    const sales = uLogs.filter(l => l.type === 'sale' && l.date).sort((a, b) => a.date.localeCompare(b.date));
    const dayMap: Record<number, number> = {};
    sales.forEach(s => {
      const day = new Date(s.date).getDate();
      dayMap[day] = (dayMap[day] || 0) + s.value;
    });
    const days: { day: number; daily: number; acc: number }[] = [];
    let acc = 0;
    for (let d = 1; d <= 31; d++) {
      if (dayMap[d]) {
        acc += dayMap[d];
        days.push({ day: d, daily: dayMap[d], acc });
      }
    }
    return days;
  }, [uLogs]);

  // ─── Expense breakdown ───
  const breakdownItems = [
    { label: 'Folha de Pagamento', value: folhaTotal, color: '#6366f1', icon: 'payments' },
    { label: 'Custos Fixos', value: totalFixed, color: '#8b5cf6', icon: 'repeat' },
    { label: 'Contas', value: totalBills, color: '#9c27b0', icon: 'event_upcoming' },
    { label: 'Despesas Variáveis', value: totalDespesasVariaveis, color: '#ef4444', icon: 'trending_down' },
    { label: 'Compras (Pedidos)', value: ordersTotal, color: '#f97316', icon: 'shopping_cart' },
  ].filter(i => i.value > 0);

  // ─── Health score ───
  const healthScore = useMemo(() => {
    let score = 100;
    if (comprometimentoTotal > 90) score -= 40;
    else if (comprometimentoTotal > 70) score -= 20;
    else if (comprometimentoTotal > 50) score -= 5;
    if (folhaPctFaturamento > 40) score -= 20;
    else if (folhaPctFaturamento > 30) score -= 10;
    if (margemPct < 0) score -= 30;
    else if (margemPct < 10) score -= 15;
    if (!breakEvenDay || breakEvenDay > 15) score -= 10;
    return Math.max(0, Math.min(100, score));
  }, [comprometimentoTotal, folhaPctFaturamento, margemPct, breakEvenDay]);

  const healthColor = healthScore >= 70 ? '#10b981' : healthScore >= 40 ? '#f59e0b' : '#ef4444';
  const healthLabel = healthScore >= 70 ? 'Saudável' : healthScore >= 40 ? 'Atenção' : 'Crítico';

  // ─── Button style helpers ───
  const periodBtn = (active: boolean) => ({
    padding: '7px 16px', borderRadius: 10,
    border: active ? '2px solid #3b82f6' : '2px solid var(--border)',
    background: active ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    fontWeight: 700 as const, fontSize: '0.75rem', cursor: 'pointer' as const,
    fontFamily: 'inherit', transition: 'all 0.2s',
    boxShadow: active ? '0 3px 10px rgba(59,130,246,0.25)' : 'none',
  });

  const dateInputStyle = {
    padding: '8px 12px', borderRadius: 10, border: '2px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 600 as const,
    fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', maxWidth: 160,
    transition: 'border-color 0.2s',
  };

  return (
    <div>
      {/* ─── Period Selector (replaces old unit selector) ─── */}
      <div style={{...cardS, padding:'16px 20px', marginBottom:16, background:'linear-gradient(135deg,rgba(59,130,246,0.06),rgba(99,102,241,0.06))', border:'1px solid rgba(59,130,246,0.12)'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{width:42, height:42, borderRadius:14, background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 15px rgba(59,130,246,0.3)'}}>
              <span className="material-symbols-outlined" style={{fontSize:22, color:'#fff'}}>analytics</span>
            </div>
            <div>
              <h3 style={{margin:0, fontSize:'1.1rem', fontWeight:800}}>Análise Financeira</h3>
              <p style={{margin:'2px 0 0', color:'var(--text-muted)', fontSize:'0.78rem', fontWeight:600}}>
                {periodLabel} {unitFromProp !== 'all' ? `• ${unitFromProp}` : '• Todas as unidades'}
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 12, padding: 3, border: '1px solid var(--border)' }}>
            <button onClick={() => setPeriodMode('month')} style={{
              padding: '6px 14px', borderRadius: 9, border: 'none',
              background: periodMode === 'month' ? '#3b82f6' : 'transparent',
              color: periodMode === 'month' ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>calendar_month</span>
              Mês
            </button>
            <button onClick={() => setPeriodMode('custom')} style={{
              padding: '6px 14px', borderRadius: 9, border: 'none',
              background: periodMode === 'custom' ? '#3b82f6' : 'transparent',
              color: periodMode === 'custom' ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>date_range</span>
              Personalizado
            </button>
          </div>
        </div>

        {/* Period sub-selectors */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(59,130,246,0.1)' }}>
          {periodMode === 'month' ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 4 }}>Período:</span>
              {[{v:1,l:'Mês atual'},{v:2,l:'2 meses'},{v:3,l:'Trimestre'},{v:6,l:'Semestre'},{v:12,l:'Ano inteiro'}].map(o => (
                <button key={o.v} onClick={() => setPeriodMonths(o.v)} style={periodBtn(periodMonths === o.v)}>
                  {o.l}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <DatePicker value={customStart} onChange={setCustomStart} label="Data Início" />
              <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>arrow_forward</span>
              </div>
              <DatePicker value={customEnd} onChange={setCustomEnd} label="Data Fim" />
              <button onClick={handleApplyRange} style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 3px 12px rgba(59,130,246,0.25)', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                Aplicar
              </button>
              {appliedRange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', marginBottom: 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#10b981' }}>check_circle</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>
                    {new Date(appliedRange.startDate + 'T12:00:00Z').toLocaleDateString('pt-BR')} — {new Date(appliedRange.endDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Health Score ─── */}
      <div style={{...cardS, padding:'20px 24px', marginBottom:16, display:'flex', alignItems:'center', gap:20}}>
        <div style={{position:'relative', width:80, height:80, flexShrink:0}}>
          <svg viewBox="0 0 100 100" style={{transform:'rotate(-90deg)'}}>
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={healthColor} strokeWidth="8"
              strokeDasharray={`${healthScore * 2.51} 251`} strokeLinecap="round"
              style={{transition:'stroke-dasharray 0.8s ease'}} />
          </svg>
          <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column'}}>
            <span style={{fontSize:'1.4rem', fontWeight:900, color:healthColor, lineHeight:1}}>{healthScore}</span>
            <span style={{fontSize:'0.55rem', fontWeight:700, color:'var(--text-muted)'}}>pontos</span>
          </div>
        </div>
        <div>
          <div style={{fontSize:'0.7rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px'}}>Saúde Financeira</div>
          <div style={{fontSize:'1.3rem', fontWeight:900, color:healthColor}}>{healthLabel}</div>
          <div style={{fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:600, marginTop:2}}>
            {comprometimentoTotal.toFixed(1)}% do faturamento comprometido com despesas
          </div>
        </div>
        <div style={{marginLeft:'auto', textAlign:'right'}}>
          <div style={{fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Faturamento{unitFromProp !== 'all' ? ` (${unitFromProp})` : ''}</div>
          <div style={{fontSize:'1.4rem', fontWeight:900, color:'#6366f1'}}>{fmt(revForAnalysis)}</div>
        </div>
      </div>

      {/* ─── Main KPI Grid ─── */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:16}}>
        {[
          { label:'Faturamento Disponível', sub:'Receita - Folha', value: fmt(faturamentoDisponivel), color: faturamentoDisponivel >= 0 ? '#10b981' : '#ef4444', icon:'account_balance_wallet' },
          { label:'Margem Operacional', sub: `${margemPct.toFixed(1)}% do faturamento`, value: fmt(margemOperacional), color: margemOperacional >= 0 ? '#10b981' : '#ef4444', icon:'trending_up' },
          { label:'Total Despesas', sub:'Fixos + Folha + Variáveis', value: fmt(totalDespesas), color:'#ef4444', icon:'shopping_cart' },
        ].map((kpi, i) => (
          <div key={i} style={{...cardS, padding:16, position:'relative', overflow:'hidden'}}>
            <div style={{position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${kpi.color},${kpi.color}66)`}} />
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
              <span style={{fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px'}}>{kpi.label}</span>
              <div style={{width:30, height:30, borderRadius:10, background:`${kpi.color}12`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <span className="material-symbols-outlined" style={{fontSize:16, color:kpi.color}}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{fontSize:'1.3rem', fontWeight:900, color:kpi.color, lineHeight:1.1}}>{kpi.value}</div>
            <div style={{fontSize:'0.65rem', color:'var(--text-muted)', marginTop:2, fontWeight:600}}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ─── Coverage & Break-even Row ─── */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16}}>
        {/* Índice de Cobertura */}
        <div style={{...cardS, padding:16}}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
            <span className="material-symbols-outlined" style={{fontSize:16, color:'#3b82f6'}}>shield</span>
            <span style={{fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Cobertura da Folha</span>
          </div>
          <div style={{fontSize:'1.6rem', fontWeight:900, color: indiceCoberturaFolha >= 100 ? '#10b981' : '#ef4444'}}>
            {folhaTotal > 0 ? `${indiceCoberturaFolha.toFixed(0)}%` : '—'}
          </div>
          <div style={{fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:600}}>
            {indiceCoberturaFolha >= 300 ? 'Excelente — folha bem coberta' :
             indiceCoberturaFolha >= 200 ? 'Bom — margem confortável' :
             indiceCoberturaFolha >= 100 ? 'Adequado — atenção ao fluxo' :
             'Crítico — faturamento não cobre a folha'}
          </div>
          {folhaTotal > 0 && (
            <div style={{height:6, borderRadius:3, background:'var(--border)', marginTop:8, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${Math.min(indiceCoberturaFolha, 100)}%`, borderRadius:3,
                background: indiceCoberturaFolha >= 100 ? '#10b981' : '#ef4444', transition:'width 0.5s'}} />
            </div>
          )}
        </div>

        {/* Break-even */}
        <div style={{...cardS, padding:16}}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
            <span className="material-symbols-outlined" style={{fontSize:16, color:'#f59e0b'}}>flag</span>
            <span style={{fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Break-even da Folha</span>
          </div>
          <div style={{fontSize:'1.6rem', fontWeight:900, color: breakEvenDay && breakEvenDay <= 10 ? '#10b981' : breakEvenDay && breakEvenDay <= 20 ? '#f59e0b' : '#ef4444'}}>
            {breakEvenDay ? `Dia ${breakEvenDay}` : folhaTotal === 0 ? '—' : 'Não atingido'}
          </div>
          <div style={{fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:600}}>
            {breakEvenDay
              ? breakEvenDay <= 5 ? 'Ideal — folha coberta nos primeiros dias' :
                breakEvenDay <= 10 ? 'Bom — coberta na 1ª quinzena' :
                breakEvenDay <= 20 ? 'Atenção — demora para cobrir folha' :
                'Risco — folha coberta muito tarde'
              : folhaTotal > 0 ? 'Faturamento insuficiente este mês' : 'Sem folha cadastrada'}
          </div>
        </div>

        {/* Folha % Faturamento */}
        <div style={{...cardS, padding:16}}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
            <span className="material-symbols-outlined" style={{fontSize:16, color:'#8b5cf6'}}>percent</span>
            <span style={{fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Folha / Faturamento</span>
          </div>
          <div style={{fontSize:'1.6rem', fontWeight:900, color: folhaPctFaturamento <= 25 ? '#10b981' : folhaPctFaturamento <= 35 ? '#f59e0b' : '#ef4444'}}>
            {revForAnalysis > 0 ? `${folhaPctFaturamento.toFixed(1)}%` : '—'}
          </div>
          <div style={{fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:600}}>
            {folhaPctFaturamento <= 25 ? 'Saudável — abaixo de 25%' :
             folhaPctFaturamento <= 35 ? 'Aceitável — entre 25-35%' :
             folhaPctFaturamento <= 45 ? 'Elevado — entre 35-45%' :
             'Crítico — acima de 45%'}
          </div>
          {revForAnalysis > 0 && (
            <div style={{height:6, borderRadius:3, background:'var(--border)', marginTop:8, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${Math.min(folhaPctFaturamento, 100)}%`, borderRadius:3,
                background: folhaPctFaturamento <= 25 ? '#10b981' : folhaPctFaturamento <= 35 ? '#f59e0b' : '#ef4444', transition:'width 0.5s'}} />
            </div>
          )}
        </div>
      </div>

      {/* ─── Composição das Despesas ─── */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
        <div style={{...cardS, padding:'20px 24px'}}>
          <h3 style={{margin:'0 0 16px', fontSize:'0.95rem', fontWeight:800, display:'flex', alignItems:'center', gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#ef4444', fontSize:18}}>bar_chart</span>
            Composição das Despesas
          </h3>
          {breakdownItems.length === 0 ? (
            <div style={{textAlign:'center', padding:20, color:'var(--text-muted)', fontSize:'0.85rem'}}>Nenhuma despesa registrada</div>
          ) : breakdownItems.sort((a,b) => b.value - a.value).map((item, i) => {
            const pct = totalDespesas > 0 ? (item.value / totalDespesas) * 100 : 0;
            return (
              <div key={i} style={{marginBottom:10}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span className="material-symbols-outlined" style={{fontSize:14, color:item.color}}>{item.icon}</span>
                    <span style={{fontSize:'0.8rem', fontWeight:700}}>{item.label}</span>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:'0.78rem', fontWeight:800, color:item.color}}>{fmt(item.value)}</span>
                    <span style={{fontSize:'0.65rem', fontWeight:700, padding:'2px 6px', borderRadius:4, background:`${item.color}10`, color:item.color}}>{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{height:8, borderRadius:4, background:'var(--border)', overflow:'hidden'}}>
                  <div style={{height:'100%', borderRadius:4, background:`linear-gradient(90deg, ${item.color}, ${item.color}88)`, width:`${pct}%`, transition:'width 0.6s', minWidth: pct > 0 ? 3 : 0}} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Despesas vs Faturamento Visual */}
        <div style={{...cardS, padding:'20px 24px'}}>
          <h3 style={{margin:'0 0 16px', fontSize:'0.95rem', fontWeight:800, display:'flex', alignItems:'center', gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#3b82f6', fontSize:18}}>compare_arrows</span>
            Faturamento vs Despesas
          </h3>
          {[
            { label:'Faturamento', value: revForAnalysis, color:'#10b981', icon:'trending_up' },
            { label:'Folha', value: folhaTotal, color:'#6366f1', icon:'payments' },
            { label:'Custos Fixos', value: totalFixed, color:'#8b5cf6', icon:'repeat' },
            { label:'Despesas Var.', value: totalDespesasVariaveis, color:'#ef4444', icon:'trending_down' },
            { label:'Contas', value: totalBills, color:'#9c27b0', icon:'event_upcoming' },
          ].filter(i => i.value > 0).map((item, i) => {
            const maxVal = Math.max(revForAnalysis, totalDespesas);
            const barPct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
            return (
              <div key={i} style={{marginBottom:10}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3}}>
                  <div style={{display:'flex', alignItems:'center', gap:5}}>
                    <span className="material-symbols-outlined" style={{fontSize:13, color:item.color}}>{item.icon}</span>
                    <span style={{fontSize:'0.78rem', fontWeight:700}}>{item.label}</span>
                  </div>
                  <span style={{fontSize:'0.78rem', fontWeight:800, color:item.color}}>{fmt(item.value)}</span>
                </div>
                <div style={{height:10, borderRadius:5, background:'var(--border)', overflow:'hidden'}}>
                  <div style={{height:'100%', borderRadius:5, background:`linear-gradient(90deg, ${item.color}, ${item.color}88)`, width:`${barPct}%`, transition:'width 0.6s', minWidth: barPct > 0 ? 3 : 0}} />
                </div>
              </div>
            );
          })}
          {revForAnalysis > 0 && (
            <div style={{marginTop:12, padding:'10px 14px', borderRadius:10, background: margemOperacional >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${margemOperacional >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:'0.78rem', fontWeight:700, color: margemOperacional >= 0 ? '#10b981' : '#ef4444'}}>
                {margemOperacional >= 0 ? '✅ Resultado Positivo' : '❌ Resultado Negativo'}
              </span>
              <span style={{fontSize:'0.9rem', fontWeight:900, color: margemOperacional >= 0 ? '#10b981' : '#ef4444'}}>{fmt(margemOperacional)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Comprometimento Detalhado ─── */}
      <div style={{...cardS, padding:'20px 24px'}}>
        <h3 style={{margin:'0 0 16px', fontSize:'0.95rem', fontWeight:800, display:'flex', alignItems:'center', gap:8}}>
          <span className="material-symbols-outlined" style={{color:'#f59e0b', fontSize:18}}>analytics</span>
          Comprometimento do Faturamento
        </h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
          {[
            { label:'Folha', pct: folhaPctFaturamento, value: folhaTotal, color:'#6366f1', max:45, ideal:25 },
            { label:'Custos Fixos', pct: fixosPctFaturamento, value: totalFixed, color:'#8b5cf6', max:30, ideal:15 },
            { label:'Desp. Variáveis', pct: despVarPctFaturamento, value: totalDespesasVariaveis, color:'#ef4444', max:20, ideal:10 },
            { label:'Comprometimento Total', pct: comprometimentoTotal, value: totalDespesas, color: comprometimentoTotal > 80 ? '#ef4444' : comprometimentoTotal > 60 ? '#f59e0b' : '#10b981', max:80, ideal:60 },
          ].map((item, i) => (
            <div key={i} style={{padding:'12px 14px', borderRadius:12, background:'var(--bg)', border:'1px solid var(--border)'}}>
              <div style={{fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:4}}>{item.label}</div>
              <div style={{fontSize:'1.2rem', fontWeight:900, color:item.color}}>
                {revForAnalysis > 0 ? `${item.pct.toFixed(1)}%` : '—'}
              </div>
              <div style={{fontSize:'0.7rem', fontWeight:600, color:'var(--text-muted)', marginBottom:6}}>{fmt(item.value)}</div>
              {revForAnalysis > 0 && (
                <div style={{position:'relative', height:6, borderRadius:3, background:'var(--border)', overflow:'hidden'}}>
                  <div style={{position:'absolute', height:'100%', width:`${Math.min((item.ideal / item.max) * 100, 100)}%`, borderRadius:3, background:'rgba(16,185,129,0.15)'}} />
                  <div style={{position:'relative', height:'100%', width:`${Math.min((item.pct / item.max) * 100, 100)}%`, borderRadius:3,
                    background: item.pct <= item.ideal ? '#10b981' : item.pct <= item.max ? '#f59e0b' : '#ef4444', transition:'width 0.5s'}} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
