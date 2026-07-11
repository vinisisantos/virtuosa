'use client';
import { useState, useRef, useEffect } from 'react';
import { LogEntry, MONTHS, UNITS, fmt, cardS, inputS, labelS } from '@/hooks/useDashboard';
import { useAnalytics, ProcRank, ClientRank } from '@/hooks/useAnalytics';
import { DatePicker } from '@/components/ui/date-picker';

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
  selectedUnit: string;
}

const UNIT_COLORS: Record<string,string> = {'Barueri':'#6366f1','Osasco':'#f59e0b','SBC':'#10b981','SCS':'#ef4444'};

export function AnalyticsSection({ logs, selectedMonth, selectedYear, selectedUnit }: Props) {
  // Period mode: 'month' = full month(s), 'custom' = date range
  const [periodMode, setPeriodMode] = useState<'month'|'custom'>('month');
  const [periodMonths, setPeriodMonths] = useState<number>(1);
  
  // Custom date range
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedRange, setAppliedRange] = useState<{ startDate: string; endDate: string } | null>(null);
  
  const a = useAnalytics({ 
    logs, selectedMonth, selectedYear, selectedUnit, periodMonths,
    customRange: periodMode === 'custom' ? appliedRange : null,
  });
  const [procLimit, setProcLimit] = useState<5|10|999>(10);
  const [procSortBy, setProcSortBy] = useState<'revenue'|'count'>('revenue');
  const [clientLimit, setClientLimit] = useState<5|10|999>(10);
  const [drilldown, setDrilldown] = useState<{type:'proc'|'client'; name:string}|null>(null);
  const [chartView, setChartView] = useState<'revenue'|'sales'>('revenue');

  // Sort procedures by selected mode
  const sortedProcedures = [...a.topProcedures].sort((a, b) =>
    procSortBy === 'revenue' ? b.revenue - a.revenue : b.count - a.count
  );

  // Compute year labels for chart legend
  const currentYearLabel = a.evolution12.length > 0
    ? (a.evolution12[0].year === a.evolution12[a.evolution12.length - 1].year
        ? String(a.evolution12[0].year)
        : `${a.evolution12[0].year}–${String(a.evolution12[a.evolution12.length - 1].year).slice(-2)}`)
    : String(selectedYear);
  const prevYearLabel = a.evolution12Prev.length > 0
    ? (a.evolution12Prev[0].year === a.evolution12Prev[a.evolution12Prev.length - 1].year
        ? String(a.evolution12Prev[0].year)
        : `${a.evolution12Prev[0].year}–${String(a.evolution12Prev[a.evolution12Prev.length - 1].year).slice(-2)}`)
    : String(selectedYear - 1);

  // Initialize custom range with current month boundaries
  useEffect(() => {
    if (!customStart) {
      const y = selectedYear;
      const m = selectedMonth;
      setCustomStart(`${y}-${String(m + 1).padStart(2, '0')}-01`);
      const lastDay = new Date(y, m + 1, 0).getDate();
      setCustomEnd(`${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
    }
  }, [selectedMonth, selectedYear]);

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

  // Chart refs
  const yoyChartRef = useRef<HTMLCanvasElement>(null);
  const procChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<any[]>([]);

  // Chart.js effect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loadCharts = async () => {
      const { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip, Filler } = await import('chart.js');
      Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip, Filler);
      chartInstances.current.forEach(c => c?.destroy());
      chartInstances.current = [];

      // 1) YoY Evolution Chart
      if (yoyChartRef.current) {
        // For shorter periods, show month/year labels for clarity
        const chartLabels = a.evolution12.length <= 6
          ? a.evolution12.map(e => `${e.month}/${String(e.year).slice(-2)}`)
          : a.evolution12.map(e => e.month);
        
        // Derive year labels from actual data
        const currentYearLabel = a.evolution12.length > 0
          ? (a.evolution12[0].year === a.evolution12[a.evolution12.length - 1].year 
              ? String(a.evolution12[0].year) 
              : `${a.evolution12[0].year}–${String(a.evolution12[a.evolution12.length - 1].year).slice(-2)}`)
          : String(selectedYear);
        const prevYearLabel = a.evolution12Prev.length > 0
          ? (a.evolution12Prev[0].year === a.evolution12Prev[a.evolution12Prev.length - 1].year 
              ? String(a.evolution12Prev[0].year)
              : `${a.evolution12Prev[0].year}–${String(a.evolution12Prev[a.evolution12Prev.length - 1].year).slice(-2)}`)
          : String(selectedYear - 1);

        const c = new Chart(yoyChartRef.current, {
          type: 'bar',
          data: {
            labels: chartLabels,
            datasets: chartView === 'revenue' ? [
              { label: currentYearLabel, data: a.evolution12.map(e => e.rev), backgroundColor: 'rgba(230,0,126,0.7)', borderRadius: 6, barPercentage: 0.7 },
              { label: prevYearLabel, data: a.evolution12Prev.map(e => e.rev), backgroundColor: 'rgba(230,0,126,0.2)', borderRadius: 6, barPercentage: 0.7 },
            ] : [
              { label: currentYearLabel, data: a.evolution12.map(e => e.sales), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6, barPercentage: 0.7 },
              { label: prevYearLabel, data: a.evolution12Prev.map(e => e.sales), backgroundColor: 'rgba(99,102,241,0.2)', borderRadius: 6, barPercentage: 0.7 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, ticks: { callback: v => chartView === 'revenue' ? fmt(v as number) : String(v), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
              x: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' as const } } }
            },
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rect', padding: 16, font: { size: 11 } } } }
          }
        });
        chartInstances.current.push(c);
      }

      // 2) Procedure Bar Chart (horizontal)
      if (procChartRef.current) {
        const sorted = [...a.topProcedures].sort((a, b) =>
          procSortBy === 'revenue' ? b.revenue - a.revenue : b.count - a.count
        );
        const top = sorted.slice(0, Math.min(procLimit, 10));
        const isCountMode = procSortBy === 'count';
        const c = new Chart(procChartRef.current, {
          type: 'bar',
          data: {
            labels: top.map(p => p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name),
            datasets: [{
              label: isCountMode ? 'Quantidade' : 'Faturamento',
              data: top.map(p => isCountMode ? p.count : p.revenue),
              backgroundColor: top.map((_, i) => {
                const colors = isCountMode
                  ? ['rgba(99,102,241,0.8)', 'rgba(99,102,241,0.65)', 'rgba(99,102,241,0.5)', 'rgba(99,102,241,0.4)', 'rgba(99,102,241,0.3)', 'rgba(99,102,241,0.25)', 'rgba(99,102,241,0.2)', 'rgba(99,102,241,0.18)', 'rgba(99,102,241,0.15)', 'rgba(99,102,241,0.12)']
                  : ['rgba(230,0,126,0.8)', 'rgba(230,0,126,0.65)', 'rgba(230,0,126,0.5)', 'rgba(230,0,126,0.4)', 'rgba(230,0,126,0.3)', 'rgba(230,0,126,0.25)', 'rgba(230,0,126,0.2)', 'rgba(230,0,126,0.18)', 'rgba(230,0,126,0.15)', 'rgba(230,0,126,0.12)'];
                return colors[i] || (isCountMode ? 'rgba(99,102,241,0.1)' : 'rgba(230,0,126,0.1)');
              }),
              borderRadius: 6,
            }]
          },
          options: {
            indexAxis: 'y' as const,
            responsive: true, maintainAspectRatio: false,
            scales: {
              x: { beginAtZero: true, ticks: { callback: v => isCountMode ? String(v) : fmt(v as number), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
              y: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' as const } } }
            },
            plugins: { legend: { display: false } }
          }
        });
        chartInstances.current.push(c);
      }
    };
    loadCharts();
    return () => { chartInstances.current.forEach(c => c?.destroy()); };
  }, [a, chartView, procLimit, procSortBy, selectedYear]);

  // KPI card helper
  const KpiCard = ({ label, value, sub, icon, color, delay }: { label:string; value:string; sub?:string; icon:string; color:string; delay:number }) => (
    <div style={{...cardS, padding:20, position:'relative', overflow:'hidden', animation:`fadeSlideUp 0.4s ease ${delay}s both`}}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow=`0 12px 30px ${color}20`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform='translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow='var(--shadow-md)'; }}
    >
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${color},${color}88)`}} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <span style={{fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</span>
        <div style={{width:36,height:36,borderRadius:12,background:`${color}12`,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span className="material-symbols-outlined" style={{fontSize:20,color}}>{icon}</span>
        </div>
      </div>
      <div style={{fontSize:'1.6rem',fontWeight:900,color,lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:'0.7rem',fontWeight:700,marginTop:6,color:sub.startsWith('↑')?'#10b981':sub.startsWith('↓')?'#ef4444':'var(--text-muted)',background:sub.startsWith('↑')?'rgba(16,185,129,0.08)':sub.startsWith('↓')?'rgba(239,68,68,0.08)':'rgba(0,0,0,0.03)',padding:'2px 8px',borderRadius:6,display:'inline-block'}}>{sub}</div>}
    </div>
  );

  // Drill-down content
  const renderDrilldown = () => {
    if (!drilldown) return null;
    const items = drilldown.type === 'proc' ? a.getSalesForProcedure(drilldown.name) : a.getSalesForClient(drilldown.name);
    const total = items.reduce((s, l) => s + l.value, 0);
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20,animation:'fadeIn 0.2s ease'}}
        onClick={() => setDrilldown(null)}
      >
        <div style={{...cardS, maxWidth:700, width:'100%', maxHeight:'80vh', overflow:'auto', padding:28}} onClick={e => e.stopPropagation()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:42,height:42,borderRadius:14,background:'linear-gradient(135deg,var(--primary),#ff4db1)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(230,0,126,0.3)'}}>
                <span className="material-symbols-outlined" style={{fontSize:20,color:'#fff'}}>{drilldown.type==='proc'?'spa':'person'}</span>
              </div>
              <div>
                <h2 style={{margin:0,fontSize:'1.15rem',fontWeight:800}}>{drilldown.name}</h2>
                <p style={{margin:0,fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600}}>
                  {items.length} venda{items.length > 1 ? 's' : ''} • Total: {fmt(total)}
                </p>
              </div>
            </div>
            <button onClick={() => setDrilldown(null)} style={{width:36,height:36,borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span className="material-symbols-outlined" style={{fontSize:18,color:'var(--text-muted)'}}>close</span>
            </button>
          </div>
          <ul style={{listStyle:'none',padding:0,margin:0}}>
            {items.map((item, i) => (
              <li key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 8px',borderRadius:10,marginBottom:2,transition:'background 0.15s'}}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(0,0,0,0.02)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
              >
                <div style={{width:36,height:36,borderRadius:10,background:'rgba(16,185,129,0.08)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span className="material-symbols-outlined" style={{fontSize:18,color:'#10b981'}}>trending_up</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:'0.88rem'}}>{item.name}</div>
                  <div style={{fontSize:'0.72rem',color:'var(--text-muted)',display:'flex',gap:6,marginTop:2}}>
                    <span>{item.date ? new Date(item.date).toLocaleDateString('pt-BR') : ''}</span>
                    {item.unit && <span style={{background:'rgba(99,102,241,0.06)',padding:'1px 6px',borderRadius:5,fontSize:'0.65rem',fontWeight:600}}>{item.unit}</span>}
                    {item.payment && <span style={{background:'rgba(16,185,129,0.06)',padding:'1px 6px',borderRadius:5,fontSize:'0.65rem',fontWeight:600}}>{item.payment}</span>}
                  </div>
                </div>
                <strong style={{color:'#10b981',fontWeight:800,fontSize:'0.9rem'}}>+{fmt(item.value)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const yoySub = a.yoy.diffPct !== 0
    ? `${a.yoy.diffPct > 0 ? '↑' : '↓'} ${Math.abs(a.yoy.diffPct).toFixed(1)}% vs ${selectedYear - 1}`
    : undefined;

  // Button style helper
  const periodBtn = (active: boolean) => ({
    padding: '7px 16px', borderRadius: 10,
    border: active ? '2px solid var(--primary)' : '2px solid var(--border)',
    background: active ? 'linear-gradient(135deg,var(--primary),#ff4db1)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    fontWeight: 700 as const, fontSize: '0.75rem', cursor: 'pointer' as const,
    fontFamily: 'inherit', transition: 'all 0.2s',
    boxShadow: active ? '0 3px 10px rgba(230,0,126,0.2)' : 'none',
  });

  const dateInputStyle = {
    padding: '8px 12px', borderRadius: 10, border: '2px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 600 as const,
    fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', maxWidth: 160,
    transition: 'border-color 0.2s',
  };

  return (
    <div className="dash-fade-in">
      {/* Header with Period Selector — NO unit selector */}
      <div style={{...cardS,marginBottom:20,background:'linear-gradient(135deg,rgba(99,102,241,0.06),rgba(230,0,126,0.06))',border:'1px solid rgba(99,102,241,0.12)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:14}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:48,height:48,borderRadius:16,background:'linear-gradient(135deg,#6366f1,var(--primary))',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 15px rgba(99,102,241,0.3)'}}>
              <span className="material-symbols-outlined" style={{fontSize:24,color:'#fff'}}>analytics</span>
            </div>
            <div>
              <h2 style={{margin:0,fontSize:'1.3rem',fontWeight:800}}>Análise de Dados</h2>
              <p style={{margin:'4px 0 0',color:'var(--text-muted)',fontSize:'0.82rem',fontWeight:600}}>
                {a.periodLabel} {selectedUnit !== 'all' ? `• ${selectedUnit}` : '• Todas as unidades'}
              </p>
            </div>
          </div>

          {/* Mode toggle: Mês / Período Personalizado */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 12, padding: 3, border: '1px solid var(--border)' }}>
            <button onClick={() => setPeriodMode('month')} style={{
              padding: '6px 14px', borderRadius: 9, border: 'none',
              background: periodMode === 'month' ? 'var(--primary)' : 'transparent',
              color: periodMode === 'month' ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>calendar_month</span>
              Mês
            </button>
            <button onClick={() => setPeriodMode('custom')} style={{
              padding: '6px 14px', borderRadius: 9, border: 'none',
              background: periodMode === 'custom' ? 'var(--primary)' : 'transparent',
              color: periodMode === 'custom' ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>date_range</span>
              Personalizado
            </button>
          </div>
        </div>

        {/* Period sub-selectors */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(99,102,241,0.1)' }}>
          {periodMode === 'month' ? (
            /* Month-based period buttons */
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 4 }}>Período:</span>
              {[{v:1,l:'Mês atual'},{v:2,l:'2 meses'},{v:3,l:'Trimestre'},{v:6,l:'Semestre'},{v:12,l:'Ano inteiro'}].map(o => (
                <button key={o.v} onClick={() => setPeriodMonths(o.v)} style={periodBtn(periodMonths === o.v)}>
                  {o.l}
                </button>
              ))}
            </div>
          ) : (
            /* Custom date range picker */
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <DatePicker value={customStart} onChange={setCustomStart} label="Data Início" />
              <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>arrow_forward</span>
              </div>
              <DatePicker value={customEnd} onChange={setCustomEnd} label="Data Fim" />
              <button onClick={handleApplyRange} style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 3px 12px rgba(230,0,126,0.25)', transition: 'all 0.2s',
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

      {/* KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:20}}>
        <KpiCard label="Faturamento" value={fmt(a.totalRev)} icon="payments" color="#10b981" delay={0} sub={yoySub} />
        <KpiCard label="Total de Vendas" value={String(a.salesCount)} icon="receipt_long" color="#6366f1" delay={0.06}
          sub={a.yoy.prevSales > 0 ? `${a.yoy.currentSales > a.yoy.prevSales ? '↑' : '↓'} ${Math.abs(a.yoy.currentSales - a.yoy.prevSales)} vs ${selectedYear - 1}` : undefined} />
        <KpiCard label="Ticket Médio" value={fmt(a.ticketMedio)} icon="local_offer" color="#f59e0b" delay={0.12} />
        <KpiCard label="Clientes Atendidos" value={String(a.currentClients)} icon="group" color="var(--primary)" delay={0.18}
          sub={a.yoy.prevClients > 0 ? `${a.currentClients > a.yoy.prevClients ? '↑' : '↓'} ${Math.abs(a.currentClients - a.yoy.prevClients)} vs ${selectedYear - 1}` : undefined} />
        <KpiCard label="Crescimento YoY" value={`${a.yoy.diffPct >= 0 ? '+' : ''}${a.yoy.diffPct.toFixed(1)}%`} icon={a.yoy.diffPct >= 0 ? 'trending_up' : 'trending_down'} color={a.yoy.diffPct >= 0 ? '#10b981' : '#ef4444'} delay={0.24}
          sub={a.yoy.diffValue !== 0 ? `${a.yoy.diffValue > 0 ? '+' : ''}${fmt(a.yoy.diffValue)}` : undefined} />
      </div>

      {/* YoY Chart */}
      <div style={{...cardS,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
          <h2 style={{margin:0,fontSize:'1rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:34,height:34,borderRadius:10,background:'rgba(99,102,241,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span className="material-symbols-outlined" style={{color:'#6366f1',fontSize:18}}>bar_chart</span>
            </div>
            Evolução Comparativa
          </h2>
          <div style={{display:'flex',gap:4}}>
            {(['revenue','sales'] as const).map(v => (
              <button key={v} onClick={() => setChartView(v)} style={{
                padding:'6px 14px',borderRadius:10,
                border:chartView===v?'2px solid var(--primary)':'2px solid var(--border)',
                background:chartView===v?'rgba(230,0,126,0.08)':'transparent',
                color:chartView===v?'var(--primary)':'var(--text-muted)',
                fontWeight:700,fontSize:'0.75rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
              }}>
                {v==='revenue'?'Faturamento':'Vendas'}
              </button>
            ))}
          </div>
        </div>
        <div style={{height:280}}><canvas ref={yoyChartRef} /></div>
        <div style={{display:'flex',justifyContent:'center',gap:20,marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.75rem',fontWeight:600,color:'var(--text-muted)'}}>
            <span style={{width:12,height:12,borderRadius:3,background:'rgba(230,0,126,0.7)',display:'inline-block'}} /> {currentYearLabel} (atual)
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.75rem',fontWeight:600,color:'var(--text-muted)'}}>
            <span style={{width:12,height:12,borderRadius:3,background:'rgba(230,0,126,0.2)',display:'inline-block'}} /> {prevYearLabel} (anterior)
          </div>
        </div>
      </div>

      {/* Two-column: Procedures Chart + Procedures List */}
      <div className="dashboard-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
        {/* Procedure Chart */}
        <div style={cardS}>
          <h2 style={{margin:'0 0 14px',fontSize:'1rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:34,height:34,borderRadius:10,background:'rgba(230,0,126,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span className="material-symbols-outlined" style={{color:'var(--primary)',fontSize:18}}>emoji_events</span>
            </div>
            Top Procedimentos
          </h2>
          <div style={{height: Math.min(a.topProcedures.length, procLimit === 999 ? 10 : procLimit) * 36 + 40}}>
            <canvas ref={procChartRef} />
          </div>
        </div>

        {/* Procedure List */}
        <div style={cardS}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
            <h2 style={{margin:0,fontSize:'1rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:34,height:34,borderRadius:10,background:'rgba(230,0,126,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span className="material-symbols-outlined" style={{color:'var(--primary)',fontSize:18}}>list</span>
              </div>
              Ranking Detalhado
            </h2>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              {/* Sort mode toggle */}
              <div style={{display:'flex',gap:2,background:'var(--bg)',borderRadius:10,padding:2,border:'1px solid var(--border)'}}>
                {([{v:'revenue' as const,l:'Valor',icon:'payments'},{v:'count' as const,l:'Quantidade',icon:'tag'}]).map(o => (
                  <button key={o.v} onClick={() => setProcSortBy(o.v)} style={{
                    padding:'4px 10px',borderRadius:8,border:'none',
                    background:procSortBy===o.v? (o.v==='revenue'?'linear-gradient(135deg,var(--primary),#ff4db1)':'linear-gradient(135deg,#6366f1,#818cf8)'):'transparent',
                    color:procSortBy===o.v?'#fff':'var(--text-muted)',
                    fontWeight:700,fontSize:'0.68rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                    display:'flex',alignItems:'center',gap:4,
                  }}>
                    <span className="material-symbols-outlined" style={{fontSize:13}}>{o.icon}</span>
                    {o.l}
                  </button>
                ))}
              </div>
              {/* Top N selector */}
              <div style={{display:'flex',gap:4}}>
                {([5,10,999] as const).map(n => (
                  <button key={n} onClick={() => setProcLimit(n)} style={{
                    padding:'4px 10px',borderRadius:8,border:procLimit===n?'2px solid var(--primary)':'2px solid var(--border)',
                    background:procLimit===n?'rgba(230,0,126,0.08)':'transparent',color:procLimit===n?'var(--primary)':'var(--text-muted)',
                    fontWeight:700,fontSize:'0.7rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                  }}>
                    {n === 999 ? 'Todos' : `Top ${n}`}
                  </button>
                ))}
              </div>
              {/* Generate Report button */}
              <button onClick={async () => {
                const allProcs = sortedProcedures;
                const totalQty = allProcs.reduce((s,p) => s+p.count, 0);
                const totalRev = allProcs.reduce((s,p) => s+p.revenue, 0);
                const unitLabel = selectedUnit === 'all' ? 'Todas Unidades' : selectedUnit;
                const periodLabel = periodMode === 'custom' && appliedRange
                  ? `${appliedRange.startDate.split('-').reverse().join('/')} até ${appliedRange.endDate.split('-').reverse().join('/')}`
                  : `${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][selectedMonth]}/${selectedYear}`;

                const reportHtml = `
<div style="font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1a1a2e;padding:0;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;border-bottom:3px solid #e6007e;padding-bottom:12px">
    <div><h1 style="font-size:16px;color:#e6007e;font-weight:800;margin:0">Relatório de Procedimentos</h1><p style="margin-top:3px;font-size:10px;color:#666">Ranking por ${procSortBy==='revenue'?'faturamento':'quantidade vendida'}</p></div>
    <div style="text-align:right;font-size:9px;color:#666"><div><strong style="color:#1a1a2e">Unidade:</strong> ${unitLabel}</div><div><strong style="color:#1a1a2e">Período:</strong> ${periodLabel}</div><div><strong style="color:#1a1a2e">Gerado:</strong> ${new Date().toLocaleString('pt-BR')}</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
    <thead><tr style="background:#1a1a2e">
      <th style="color:#fff;padding:6px 8px;text-align:center;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:0.5px;width:30px">#</th>
      <th style="color:#fff;padding:6px 8px;text-align:left;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:0.5px">Procedimento</th>
      <th style="color:#fff;padding:6px 8px;text-align:right;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:0.5px">Qtd</th>
      <th style="color:#fff;padding:6px 8px;text-align:right;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:0.5px">Preço Médio</th>
      <th style="color:#fff;padding:6px 8px;text-align:right;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:0.5px">Valor Total</th>
      <th style="color:#fff;padding:6px 8px;text-align:right;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:0.5px">%</th>
    </tr></thead>
    <tbody>
      ${allProcs.map((p,i) => `<tr style="background:${i%2===1?'#f8f9fa':'#fff'}"><td style="padding:5px 8px;font-weight:800;color:#e6007e;text-align:center;font-size:9px;border-bottom:1px solid #e5e7eb">${i+1}º</td><td style="padding:5px 8px;font-size:9px;border-bottom:1px solid #e5e7eb">${p.name}</td><td style="padding:5px 8px;text-align:right;font-size:9px;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">${p.count.toLocaleString('pt-BR')}</td><td style="padding:5px 8px;text-align:right;font-size:9px;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">${fmt(p.count>0?p.revenue/p.count:0)}</td><td style="padding:5px 8px;text-align:right;font-size:9px;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums;font-weight:700">${fmt(p.revenue)}</td><td style="padding:5px 8px;text-align:right;font-size:9px;border-bottom:1px solid #e5e7eb;color:#666">${p.pct.toFixed(1)}%</td></tr>`).join('')}
      <tr style="background:#1a1a2e"><td colspan="2" style="padding:7px 8px;color:#fff;font-weight:800;text-align:right;font-size:9px">Total: ${totalQty.toLocaleString('pt-BR')} procedimentos</td><td style="padding:7px 8px;color:#fff;font-weight:800;text-align:right;font-size:9px">${totalQty.toLocaleString('pt-BR')}</td><td></td><td style="padding:7px 8px;color:#fff;font-weight:800;text-align:right;font-size:9px">${fmt(totalRev)}</td><td style="padding:7px 8px;color:#fff;font-weight:800;text-align:right;font-size:9px">100%</td></tr>
    </tbody>
  </table>
</div>`;

                // Try to fetch background PDF from contract templates
                let bgBase64: string | null = null;
                try {
                  const res = await fetch('/api/contract-templates');
                  if (res.ok) {
                    const templates = await res.json();
                    // Find first template with a backgroundPdf
                    const tpl = (Array.isArray(templates) ? templates : []).find((t: any) => t.backgroundPdf);
                    if (tpl) bgBase64 = tpl.backgroundPdf;
                  }
                } catch { /* ignore - will use HTML fallback */ }

                if (bgBase64) {
                  // Generate PDF with background watermark (same technique as contracts)
                  try {
                    const { PDFDocument } = await import('pdf-lib');
                    const html2canvas = (await import('html2canvas')).default;

                    const bgBinary = atob(bgBase64);
                    const bgBytes = new Uint8Array(bgBinary.length);
                    for (let i = 0; i < bgBinary.length; i++) bgBytes[i] = bgBinary.charCodeAt(i);
                    const bgDoc = await PDFDocument.load(bgBytes);
                    const bgPage = bgDoc.getPages()[0];
                    const { width: pdfW, height: pdfH } = bgPage.getSize();

                    const marginTop = 135;
                    const marginBottom = 120;
                    const marginLeft = 60;
                    const marginRight = 60;
                    const contentW = pdfW - marginLeft - marginRight;
                    const contentH = pdfH - marginTop - marginBottom;

                    const scale = 2;
                    const renderWidthPx = Math.round(contentW * scale);
                    const maxPageHeightPx = Math.round(contentH * scale);
                    const safetyBuffer = 25;

                    // Render HTML offscreen
                    const renderDiv = document.createElement('div');
                    renderDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:${renderWidthPx}px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:${9.5*scale}px;line-height:1.4;color:#1a1a1a;padding:0;z-index:-1;`;
                    renderDiv.innerHTML = reportHtml;
                    document.body.appendChild(renderDiv);
                    await new Promise(r => setTimeout(r, 300));

                    const totalHeight = renderDiv.scrollHeight;

                    // Full canvas
                    const fullCanvas = await html2canvas(renderDiv, {
                      backgroundColor: null, scale: 1, useCORS: true, logging: false,
                      width: renderWidthPx, height: totalHeight, windowWidth: renderWidthPx, windowHeight: totalHeight,
                    });

                    // Pixel analysis for safe page breaks
                    const fullCtx = fullCanvas.getContext('2d');
                    const imgData = fullCtx ? fullCtx.getImageData(0, 0, renderWidthPx, totalHeight).data : null;
                    const isRowBlank = new Uint8Array(totalHeight);
                    if (imgData) {
                      for (let y = 0; y < totalHeight; y++) {
                        let empty = true;
                        const offset = y * renderWidthPx * 4;
                        for (let x = 0; x < renderWidthPx; x++) {
                          const r = imgData[offset + x * 4], g = imgData[offset + x * 4 + 1], b = imgData[offset + x * 4 + 2], a2 = imgData[offset + x * 4 + 3];
                          if (a2 > 5 && (r < 245 || g < 245 || b < 245)) { empty = false; break; }
                        }
                        isRowBlank[y] = empty ? 1 : 0;
                      }
                    }

                    // Page slices
                    const pageSlices: {start:number;end:number}[] = [];
                    let currentStart = 0;
                    while (currentStart < totalHeight) {
                      const idealEnd = currentStart + maxPageHeightPx;
                      if (idealEnd >= totalHeight) { pageSlices.push({start:currentStart,end:totalHeight}); break; }
                      const safeEnd = idealEnd - safetyBuffer;
                      let bestEnd = -1;
                      if (imgData) {
                        for (let y = safeEnd; y > currentStart + 40; y--) {
                          let isGap = true;
                          for (let gi = 0; gi < 6; gi++) { if (!isRowBlank[y - gi]) { isGap = false; break; } }
                          if (isGap) { bestEnd = y - 3; break; }
                        }
                        if (bestEnd === -1) {
                          for (let y = safeEnd; y > currentStart + 40; y--) { if (isRowBlank[y]) { bestEnd = y; break; } }
                        }
                      }
                      if (bestEnd === -1) bestEnd = safeEnd;
                      pageSlices.push({start:currentStart,end:bestEnd});
                      currentStart = bestEnd;
                    }

                    // Build output PDF
                    const outDoc = await PDFDocument.create();
                    for (const {start,end} of pageSlices) {
                      const sliceH = end - start;
                      const sliceCanvas = document.createElement('canvas');
                      sliceCanvas.width = renderWidthPx; sliceCanvas.height = sliceH;
                      const ctx = sliceCanvas.getContext('2d');
                      if (ctx) ctx.drawImage(fullCanvas, 0, start, renderWidthPx, sliceH, 0, 0, renderWidthPx, sliceH);
                      const pngBase64 = sliceCanvas.toDataURL('image/png',1.0).split(',')[1];
                      const pngImage = await outDoc.embedPng(pngBase64);
                      const [copiedPage] = await outDoc.copyPages(bgDoc, [0]);
                      outDoc.addPage(copiedPage);
                      const page = outDoc.getPages()[outDoc.getPageCount()-1];
                      const pdfSliceH = contentH * (sliceH / maxPageHeightPx);
                      page.drawImage(pngImage, { x: marginLeft, y: marginBottom + contentH - pdfSliceH, width: contentW, height: pdfSliceH });
                    }

                    document.body.removeChild(renderDiv);
                    const pdfBytes = await outDoc.save();
                    const blob = new Blob([pdfBytes as BlobPart], {type:'application/pdf'});
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    return;
                  } catch (err) {
                    console.error('PDF generation failed, falling back to HTML:', err);
                  }
                }

                // Fallback: open printable HTML window
                const htmlFallback = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Relatório de Procedimentos - ${unitLabel}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Tahoma,sans-serif;padding:30px;color:#1a1a2e;font-size:12px}
  .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:3px solid #e6007e;padding-bottom:16px}
  .header h1{font-size:20px;color:#e6007e;font-weight:800}
  .header .meta{text-align:right;color:#666;font-size:12px}
  .header .meta strong{color:#1a1a2e}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:11.5px}
  tr:nth-child(even){background:#f8f9fa}
  .rank{font-weight:800;color:#e6007e;text-align:center;width:40px}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .total-row{background:#1a1a2e!important;color:#fff;font-weight:800}
  .total-row td{border:none;padding:10px}
  .print-btn{position:fixed;top:16px;right:16px;background:linear-gradient(135deg,#e6007e,#ff4db1);color:#fff;border:none;padding:10px 24px;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px;box-shadow:0 4px 12px rgba(230,0,126,0.3)}
  @media print{.print-btn{display:none}tr{break-inside:avoid}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimir / PDF</button>
<div class="header">
  <div><h1>Virtuosa - Relatório de Procedimentos</h1><p style="margin-top:4px;font-size:13px;color:#666">Ranking por ${procSortBy==='revenue'?'faturamento':'quantidade vendida'}</p></div>
  <div class="meta"><div><strong>Unidade:</strong> ${unitLabel}</div><div><strong>Período:</strong> ${periodLabel}</div><div><strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR')}</div></div>
</div>
<table>
<thead><tr><th style="text-align:center">#</th><th>Procedimento</th><th class="num">Qtd</th><th class="num">Preço Médio</th><th class="num">Valor Total</th><th class="num">%</th></tr></thead>
<tbody>
${allProcs.map((p,i) => `<tr><td class="rank">${i+1}º</td><td>${p.name}</td><td class="num">${p.count.toLocaleString('pt-BR')}</td><td class="num">${fmt(p.count>0?p.revenue/p.count:0)}</td><td class="num">${fmt(p.revenue)}</td><td class="num">${p.pct.toFixed(1)}%</td></tr>`).join('\n')}
<tr class="total-row"><td colspan="2" style="text-align:right">Total: ${totalQty.toLocaleString('pt-BR')}</td><td class="num">${totalQty.toLocaleString('pt-BR')}</td><td></td><td class="num">${fmt(totalRev)}</td><td class="num">100%</td></tr>
</tbody></table>
<button onclick="(function(){var rows=[['#','Procedimento','Qtd','Preço Médio','Valor Total','%']];${JSON.stringify(allProcs.map((p,i) => [i+1,p.name,p.count,p.count>0?(p.revenue/p.count).toFixed(2):'0',p.revenue.toFixed(2),p.pct.toFixed(1)+'%']))}.forEach(function(r){rows.push(r)});var csv=rows.map(function(r){return r.map(function(c){return typeof c==='string'&&c.indexOf(',')>=0?'\"'+c+'\"':c}).join(';')}).join('\\n');var b=new Blob(['\\uFEFF'+csv],{type:'text/csv;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='relatorio.csv';a.click()})()" style="background:#10b981;color:#fff;border:none;padding:10px 24px;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">📊 CSV</button>
</body></html>`;
                const w = window.open('', '_blank');
                if(w){w.document.write(htmlFallback);w.document.close();}
              }} style={{
                padding:'4px 12px',borderRadius:8,border:'none',
                background:'linear-gradient(135deg,#10b981,#059669)',color:'#fff',
                fontWeight:700,fontSize:'0.68rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                display:'flex',alignItems:'center',gap:4,
              }}>
                <span className="material-symbols-outlined" style={{fontSize:13}}>description</span>
                Relatório
              </button>
            </div>
          </div>
          <div style={{maxHeight:400,overflowY:'auto'}}>
            {sortedProcedures.length === 0 ? (
              <div style={{textAlign:'center',padding:'32px 20px'}}>
                <span className="material-symbols-outlined" style={{fontSize:40,color:'var(--border)',marginBottom:8,display:'block'}}>spa</span>
                <p style={{color:'var(--text-muted)',fontSize:'0.88rem',fontWeight:600}}>Nenhum procedimento neste período.</p>
              </div>
            ) : sortedProcedures.slice(0, procLimit).map((proc, i) => {
              const maxMetric = procSortBy === 'revenue'
                ? (sortedProcedures[0]?.revenue || 1)
                : (sortedProcedures[0]?.count || 1);
              const currentMetric = procSortBy === 'revenue' ? proc.revenue : proc.count;
              const pct = (currentMetric / maxMetric) * 100;
              const barColor = procSortBy === 'revenue'
                ? 'linear-gradient(90deg,var(--primary),#ff4db1)'
                : 'linear-gradient(90deg,#6366f1,#818cf8)';
              return (
                <div key={proc.name} style={{marginBottom:8,cursor:'pointer',padding:'8px 10px',borderRadius:10,transition:'all 0.15s'}}
                  onClick={() => setDrilldown({type:'proc',name:proc.name})}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='rgba(230,0,126,0.03)'; (e.currentTarget as HTMLElement).style.transform='translateX(3px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.transform='translateX(0)'; }}
                >
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <span style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.82rem',fontWeight:700}}>
                      {i < 3 ? (
                        <span style={{width:24,height:24,borderRadius:8,background:['linear-gradient(135deg,#f59e0b,#d97706)','linear-gradient(135deg,#94a3b8,#64748b)','linear-gradient(135deg,#d97706,#92400e)'][i],color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:900,flexShrink:0}}>{i+1}</span>
                      ) : (
                        <span style={{width:24,height:24,borderRadius:8,background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text-muted)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:700,flexShrink:0}}>{i+1}</span>
                      )}
                      {proc.name}
                    </span>
                    <span style={{display:'flex',gap:10,alignItems:'center'}}>
                      <span style={{color: procSortBy==='count'?'#6366f1':'var(--text-muted)',fontWeight: procSortBy==='count'?800:600,fontSize:'0.75rem',background: procSortBy==='count'?'rgba(99,102,241,0.08)':'transparent',padding: procSortBy==='count'?'2px 6px':'0',borderRadius:6}}>{proc.count}x</span>
                      <span style={{fontWeight: procSortBy==='revenue'?800:600,fontSize:'0.85rem',color: procSortBy==='revenue'?'var(--text-main)':'var(--text-muted)'}}>{fmt(proc.revenue)}</span>
                      <span style={{fontSize:'0.68rem',color:'var(--text-muted)',fontWeight:600}}>{proc.pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div style={{height:5,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:pct+'%',background:barColor,borderRadius:4,transition:'width 0.5s ease'}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Clients */}
      <div style={{...cardS,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
          <h2 style={{margin:0,fontSize:'1rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:34,height:34,borderRadius:10,background:'rgba(99,102,241,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span className="material-symbols-outlined" style={{color:'#6366f1',fontSize:18}}>group</span>
            </div>
            Clientes que Mais Compram
          </h2>
          <div style={{display:'flex',gap:4}}>
            {([5,10,999] as const).map(n => (
              <button key={n} onClick={() => setClientLimit(n)} style={{
                padding:'4px 10px',borderRadius:8,border:clientLimit===n?'2px solid #6366f1':'2px solid var(--border)',
                background:clientLimit===n?'rgba(99,102,241,0.08)':'transparent',color:clientLimit===n?'#6366f1':'var(--text-muted)',
                fontWeight:700,fontSize:'0.7rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
              }}>
                {n === 999 ? 'Todos' : `Top ${n}`}
              </button>
            ))}
          </div>
        </div>

        {/* Top 3 Highlight Cards */}
        {a.topClients.length >= 3 && (
          <div className="dashboard-grid-2col" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
            {a.topClients.slice(0, 3).map((client, i) => {
              const colors = ['linear-gradient(135deg,#f59e0b,#d97706)','linear-gradient(135deg,#94a3b8,#64748b)','linear-gradient(135deg,#d97706,#92400e)'];
              const bgColors = ['rgba(245,158,11,0.04)','rgba(148,163,184,0.04)','rgba(217,119,6,0.04)'];
              const borderColors = ['rgba(245,158,11,0.15)','rgba(148,163,184,0.15)','rgba(217,119,6,0.15)'];
              return (
                <div key={client.name} style={{...cardS,padding:18,background:bgColors[i],border:`1px solid ${borderColors[i]}`,cursor:'pointer',position:'relative',overflow:'hidden'}}
                  onClick={() => setDrilldown({type:'client',name:client.name})}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-3px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform='translateY(0)'; }}
                >
                  <div style={{position:'absolute',top:8,right:12}}>
                    <span style={{width:28,height:28,borderRadius:8,background:colors[i],color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',fontWeight:900}}>{i+1}</span>
                  </div>
                  <div style={{fontSize:'0.95rem',fontWeight:800,marginBottom:6,maxWidth:'85%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{client.name}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.3px'}}>Total</div>
                      <div style={{fontSize:'1.1rem',fontWeight:900,color:'#10b981'}}>{fmt(client.totalSpent)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.3px'}}>Compras</div>
                      <div style={{fontSize:'1.1rem',fontWeight:900,color:'#6366f1'}}>{client.count}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.3px'}}>Ticket</div>
                      <div style={{fontSize:'0.88rem',fontWeight:800,color:'#f59e0b'}}>{fmt(client.ticketMedio)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.3px'}}>Primeira</div>
                      <div style={{fontSize:'0.78rem',fontWeight:700,color:'#6366f1'}}>{client.firstDate ? new Date(client.firstDate).toLocaleDateString('pt-BR') : '—'}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.3px'}}>Última</div>
                      <div style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-muted)'}}>{client.lastDate ? new Date(client.lastDate).toLocaleDateString('pt-BR') : '—'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full Client Table */}
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
            <thead>
              <tr style={{borderBottom:'2px solid var(--border)'}}>
                <th style={{textAlign:'left',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>#</th>
                <th style={{textAlign:'left',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>Cliente</th>
                <th style={{textAlign:'right',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>Compras</th>
                <th style={{textAlign:'right',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>Total</th>
                <th style={{textAlign:'right',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>Ticket</th>
                <th style={{textAlign:'right',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>Primeira Visita</th>
                <th style={{textAlign:'right',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>Última Visita</th>
              </tr>
            </thead>
            <tbody>
              {a.topClients.length === 0 ? (
                <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text-muted)',fontWeight:600}}>Nenhum cliente neste período.</td></tr>
              ) : a.topClients.slice(0, clientLimit).map((client, i) => (
                <tr key={client.name} style={{borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'background 0.15s'}}
                  onClick={() => setDrilldown({type:'client',name:client.name})}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(99,102,241,0.03)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
                >
                  <td style={{padding:'12px 8px',fontWeight:700,color:'var(--text-muted)',fontSize:'0.75rem'}}>{i+1}</td>
                  <td style={{padding:'12px 8px',fontWeight:700}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:30,height:30,borderRadius:10,background:`hsl(${(i*37)%360}, 60%, 92%)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.72rem',fontWeight:900,color:`hsl(${(i*37)%360}, 60%, 40%)`,flexShrink:0}}>
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{client.name}</span>
                    </div>
                  </td>
                  <td style={{textAlign:'right',padding:'12px 8px',fontWeight:600}}>{client.count}</td>
                  <td style={{textAlign:'right',padding:'12px 8px',fontWeight:800,color:'#10b981'}}>{fmt(client.totalSpent)}</td>
                  <td style={{textAlign:'right',padding:'12px 8px',fontWeight:600}}>{fmt(client.ticketMedio)}</td>
                  <td style={{textAlign:'right',padding:'12px 8px',fontWeight:600,color:'#6366f1',fontSize:'0.75rem'}}>{client.firstDate ? new Date(client.firstDate).toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{textAlign:'right',padding:'12px 8px',fontWeight:600,color:'var(--text-muted)',fontSize:'0.75rem'}}>{client.lastDate ? new Date(client.lastDate).toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unit Breakdown (only show when "all" selected) */}
      {selectedUnit === 'all' && (
        <div style={{...cardS,marginBottom:20}}>
          <h2 style={{margin:'0 0 16px',fontSize:'1rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:34,height:34,borderRadius:10,background:'rgba(99,102,241,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span className="material-symbols-outlined" style={{color:'#6366f1',fontSize:18}}>location_on</span>
            </div>
            Performance por Unidade
          </h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14}}>
            {UNITS.map(u => {
              const data = a.revByUnit[u];
              const color = UNIT_COLORS[u] || '#999';
              return (
                <div key={u} style={{padding:18,borderRadius:16,border:`1px solid ${color}20`,background:`${color}04`,transition:'all 0.2s'}}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform='translateY(0)'}
                >
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                    <span style={{width:12,height:12,borderRadius:4,background:color,display:'inline-block'}} />
                    <span style={{fontWeight:800,fontSize:'0.95rem'}}>{u}</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase'}}>Faturamento</div>
                      <div style={{fontSize:'1rem',fontWeight:900,color:'#10b981'}}>{fmt(data.rev)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase'}}>Vendas</div>
                      <div style={{fontSize:'1rem',fontWeight:900,color:'#6366f1'}}>{data.sales}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase'}}>Clientes</div>
                      <div style={{fontSize:'1rem',fontWeight:900,color:'#f59e0b'}}>{data.clients}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase'}}>Ticket</div>
                      <div style={{fontSize:'1rem',fontWeight:900,color:'var(--text-main)'}}>{data.sales > 0 ? fmt(data.rev / data.sales) : '—'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drill-down Modal */}
      {renderDrilldown()}

      <style>{`
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      `}</style>
    </div>
  );
}
