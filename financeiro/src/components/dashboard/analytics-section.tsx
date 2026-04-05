'use client';
import { useState, useRef, useEffect } from 'react';
import { LogEntry, MONTHS, UNITS, fmt, cardS, inputS, labelS } from '@/hooks/useDashboard';
import { useAnalytics, ProcRank, ClientRank } from '@/hooks/useAnalytics';

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
  const [clientLimit, setClientLimit] = useState<5|10|999>(10);
  const [drilldown, setDrilldown] = useState<{type:'proc'|'client'; name:string}|null>(null);
  const [chartView, setChartView] = useState<'revenue'|'sales'>('revenue');

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
        const c = new Chart(yoyChartRef.current, {
          type: 'bar',
          data: {
            labels: a.evolution12.map(e => e.month),
            datasets: chartView === 'revenue' ? [
              { label: `${selectedYear}`, data: a.evolution12.map(e => e.rev), backgroundColor: 'rgba(230,0,126,0.7)', borderRadius: 6, barPercentage: 0.7 },
              { label: `${selectedYear - 1}`, data: a.evolution12Prev.map(e => e.rev), backgroundColor: 'rgba(230,0,126,0.2)', borderRadius: 6, barPercentage: 0.7 },
            ] : [
              { label: `${selectedYear}`, data: a.evolution12.map(e => e.sales), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6, barPercentage: 0.7 },
              { label: `${selectedYear - 1}`, data: a.evolution12Prev.map(e => e.sales), backgroundColor: 'rgba(99,102,241,0.2)', borderRadius: 6, barPercentage: 0.7 },
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
        const top = a.topProcedures.slice(0, Math.min(procLimit, 10));
        const c = new Chart(procChartRef.current, {
          type: 'bar',
          data: {
            labels: top.map(p => p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name),
            datasets: [{
              label: 'Faturamento',
              data: top.map(p => p.revenue),
              backgroundColor: top.map((_, i) => {
                const colors = ['rgba(230,0,126,0.8)', 'rgba(230,0,126,0.65)', 'rgba(230,0,126,0.5)', 'rgba(230,0,126,0.4)', 'rgba(230,0,126,0.3)', 'rgba(230,0,126,0.25)', 'rgba(230,0,126,0.2)', 'rgba(230,0,126,0.18)', 'rgba(230,0,126,0.15)', 'rgba(230,0,126,0.12)'];
                return colors[i] || 'rgba(230,0,126,0.1)';
              }),
              borderRadius: 6,
            }]
          },
          options: {
            indexAxis: 'y' as const,
            responsive: true, maintainAspectRatio: false,
            scales: {
              x: { beginAtZero: true, ticks: { callback: v => fmt(v as number), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
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
  }, [a, chartView, procLimit, selectedYear]);

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
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>event</span>
                  Data Início
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  style={dateInputStyle}
                  onFocus={e => { e.target.style.borderColor = 'var(--primary)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>arrow_forward</span>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>event</span>
                  Data Fim
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  style={dateInputStyle}
                  onFocus={e => { e.target.style.borderColor = 'var(--primary)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <button onClick={handleApplyRange} style={{
                padding: '8px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 3px 12px rgba(230,0,126,0.25)', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                Aplicar
              </button>
              {appliedRange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
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
            <span style={{width:12,height:12,borderRadius:3,background:'rgba(230,0,126,0.7)',display:'inline-block'}} /> {selectedYear} (atual)
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.75rem',fontWeight:600,color:'var(--text-muted)'}}>
            <span style={{width:12,height:12,borderRadius:3,background:'rgba(230,0,126,0.2)',display:'inline-block'}} /> {selectedYear - 1} (anterior)
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
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <h2 style={{margin:0,fontSize:'1rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:34,height:34,borderRadius:10,background:'rgba(230,0,126,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span className="material-symbols-outlined" style={{color:'var(--primary)',fontSize:18}}>list</span>
              </div>
              Ranking Detalhado
            </h2>
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
          </div>
          <div style={{maxHeight:400,overflowY:'auto'}}>
            {a.topProcedures.length === 0 ? (
              <div style={{textAlign:'center',padding:'32px 20px'}}>
                <span className="material-symbols-outlined" style={{fontSize:40,color:'var(--border)',marginBottom:8,display:'block'}}>spa</span>
                <p style={{color:'var(--text-muted)',fontSize:'0.88rem',fontWeight:600}}>Nenhum procedimento neste período.</p>
              </div>
            ) : a.topProcedures.slice(0, procLimit).map((proc, i) => {
              const maxRev = a.topProcedures[0]?.revenue || 1;
              const pct = (proc.revenue / maxRev) * 100;
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
                      <span style={{color:'var(--text-muted)',fontWeight:600,fontSize:'0.75rem'}}>{proc.count}x</span>
                      <span style={{fontWeight:800,fontSize:'0.85rem'}}>{fmt(proc.revenue)}</span>
                      <span style={{fontSize:'0.68rem',color:'var(--text-muted)',fontWeight:600}}>{proc.pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div style={{height:5,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:pct+'%',background:'linear-gradient(90deg,var(--primary),#ff4db1)',borderRadius:4,transition:'width 0.5s ease'}} />
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
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
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
                <th style={{textAlign:'right',padding:'10px 8px',fontWeight:800,color:'var(--text-muted)',fontSize:'0.7rem',textTransform:'uppercase'}}>Última Visita</th>
              </tr>
            </thead>
            <tbody>
              {a.topClients.length === 0 ? (
                <tr><td colSpan={6} style={{textAlign:'center',padding:32,color:'var(--text-muted)',fontWeight:600}}>Nenhum cliente neste período.</td></tr>
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
