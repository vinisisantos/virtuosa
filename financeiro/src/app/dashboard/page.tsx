'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useDashboard, MONTHS, UNITS, fmt, cardS, Tab } from '@/hooks/useDashboard';
import { SalesSection } from '@/components/dashboard/sales-section';

import { GoalsSection } from '@/components/dashboard/goals-section';
import { ReportsSection } from '@/components/dashboard/reports-section';
import { AnalyticsSection } from '@/components/dashboard/analytics-section';
import { PaymentReminder } from '@/components/dashboard/payment-reminder';

const DASH_TABS:{key:Tab;label:string;icon:string;color:string}[] = [
  {key:'dashboard',label:'Visão Geral',icon:'dashboard',color:'#6366f1'},
  {key:'sales',label:'Vendas',icon:'point_of_sale',color:'#10b981'},
  {key:'goals',label:'Metas',icon:'flag',color:'#f59e0b'},
  {key:'reports',label:'Relatórios',icon:'summarize',color:'#8b5cf6'},
  {key:'analytics',label:'Análise',icon:'analytics',color:'#3b82f6'},
];

const UNIT_COLORS:Record<string,string> = {'Barueri':'#6366f1','Osasco':'#f59e0b','SBC':'#10b981','SCS':'#ef4444'};
const CAT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

/* ── Stagger animation variants ── */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

/* ── CountUp component ── */
function CountUp({ value, prefix = '', suffix = '', duration = 1200 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    startTime.current = null;
    const animate = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(eased * value);
      if (progress < 1) rafId.current = requestAnimationFrame(animate);
    };
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [value, duration]);

  const formatted = prefix + display.toLocaleString('pt-BR', { minimumFractionDigits: suffix === '%' ? 1 : 2, maximumFractionDigits: suffix === '%' ? 1 : 2 }) + suffix;
  return <>{formatted}</>;
}

function CountUpInt({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    startTime.current = null;
    const animate = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) rafId.current = requestAnimationFrame(animate);
    };
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [value, duration]);

  return <>{display}</>;
}

/* ── Mini Sparkline SVG ── */
function Sparkline({ data, color, width = 70, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data) || 1;
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x},${y}`;
  });
  const fillPts = [`0,${height}`, ...pts, `${width},${height}`].join(' ');
  const uid = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', opacity: 0.55 }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${uid})`} points={fillPts} />
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
    </svg>
  );
}

/* ── Skeleton Loader ── */
function Skeleton({ width = '100%', height = 20, radius = 8 }: { width?: string | number; height?: number; radius?: number }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, var(--border) 25%, rgba(230,0,126,0.06) 50%, var(--border) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  );
}

export default function DashboardPage() {
  const d = useDashboard();
  const [rankingTab, setRankingTab] = useState('Todas');
  const [procSearch, setProcSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showAllProcs, setShowAllProcs] = useState(false);
  const [showAllClients, setShowAllClients] = useState(false);

  // Chart.js effect — evolution + comparison
  useEffect(() => {
    if(d.activeTab!=='dashboard'||typeof window==='undefined') return;
    const loadChart = async () => {
      const { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip, Filler, ArcElement, DoughnutController } = await import('chart.js');
      Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip, Filler, ArcElement, DoughnutController);
      d.chartInstances.current.forEach(c=>c?.destroy());
      d.chartInstances.current=[];

      // 1) Monthly evolution line chart
      if(d.barRef.current){
        const ctx = d.barRef.current.getContext('2d')!;
        const gradGreen = ctx.createLinearGradient(0, 0, 0, 220);
        gradGreen.addColorStop(0, 'rgba(16,185,129,0.18)');
        gradGreen.addColorStop(1, 'rgba(16,185,129,0)');
        const gradRed = ctx.createLinearGradient(0, 0, 0, 220);
        gradRed.addColorStop(0, 'rgba(239,68,68,0.12)');
        gradRed.addColorStop(1, 'rgba(239,68,68,0)');
        const c=new Chart(d.barRef.current,{
          type:'line',
          data:{
            labels:d.monthlyEvolution.map(e=>e.month),
            datasets:[
              {label:'Faturamento',data:d.monthlyEvolution.map(e=>e.rev),borderColor:'#10b981',backgroundColor:gradGreen,fill:true,tension:0.4,pointRadius:5,pointBackgroundColor:'#10b981',pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2.5},
              {label:'Custos',data:d.monthlyEvolution.map(e=>e.cost),borderColor:'#ef4444',backgroundColor:gradRed,fill:true,tension:0.4,pointRadius:5,pointBackgroundColor:'#ef4444',pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2.5,borderDash:[5,5]},
            ]
          },
          options:{responsive:true,maintainAspectRatio:false,
            interaction:{mode:'index' as const,intersect:false},
            scales:{y:{beginAtZero:true,ticks:{callback:v=>fmt(v as number),font:{size:10}},grid:{color:'rgba(0,0,0,0.04)'}},x:{grid:{display:false},ticks:{font:{size:11,weight:'bold' as const}}}},
            plugins:{
              legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',padding:16,font:{size:11}}},
              tooltip:{
                backgroundColor:'var(--card-bg, #fff)',titleColor:'var(--text-main, #1a1a2e)',bodyColor:'var(--text-main, #1a1a2e)',
                borderColor:'var(--border, #e5e7eb)',borderWidth:1,cornerRadius:12,padding:14,
                usePointStyle:true,
                callbacks:{
                  label:(ctx: any)=>`  ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
                  afterBody:(items: any)=>{
                    if(items.length>=2){
                      const rev=items[0].parsed.y; const cost=items[1].parsed.y;
                      const diff=rev-cost; const margin=rev>0?((diff/rev)*100).toFixed(1):'0';
                      return [`  ──────────────`,`  Lucro: ${fmt(diff)}`,`  Margem: ${margin}%`];
                    } return [];
                  }
                }
              }
            }
          }
        });
        d.chartInstances.current.push(c);
      }
    };
    loadChart();
    return ()=>{d.chartInstances.current.forEach(c=>c?.destroy());d.chartInstances.current=[];};
  }, [d.activeTab, d.monthlyEvolution]);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{width:'100%',maxWidth:1400,margin:'0 auto',minHeight:'100vh',paddingBottom:60}}>
        <AppHeader activePage="dashboard" />
        <main style={{padding:'0 20px'}}>
          {/* Section Header */}
          {(()=>{
            const activeMeta = DASH_TABS.find(t=>t.key===d.activeTab) || DASH_TABS[0];
            return (
              <section style={{ margin: '32px 0 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${activeMeta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: activeMeta.color }}>{activeMeta.icon}</span>
                </div>
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>{activeMeta.label}</h1>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Dashboard Virtuosa</p>
                </div>
              </section>
            );
          })()}

          {/* ── Dashboard Overview ── */}
          {d.activeTab==='dashboard'&&(
            <div>
              {/* Compact Welcome Line */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:'1rem',fontWeight:700,color:'var(--text-main)'}}>{greeting} 👋</span>
                  <span style={{fontSize:'0.82rem',color:'var(--text-muted)',fontWeight:500}}>·</span>
                  <span style={{fontSize:'0.82rem',color:'var(--text-muted)',fontWeight:600}}>{MONTHS[d.selectedMonth]} {d.selectedYear}</span>
                  {d.selectedUnit!=='all'&&<><span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>·</span><span style={{fontSize:'0.82rem',color:'var(--text-muted)',fontWeight:600}}>{d.selectedUnit}</span></>}
                </div>
                {d.dueBills.length>0&&(
                  <span style={{fontSize:'0.78rem',fontWeight:700,color:'#ef4444',display:'flex',alignItems:'center',gap:4}}>
                    <span style={{width:6,height:6,borderRadius:3,background:'#ef4444',display:'inline-block',animation:'pulse 1.5s infinite'}} />
                    {d.dueBills.length} conta{d.dueBills.length>1?'s':''} a vencer
                  </span>
                )}
              </div>

              {/* Smart Alerts — condensed dot+text */}
              {d.smartAlerts.length > 0 && (
                <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:14}}>
                  {d.smartAlerts.map((alert, i) => {
                    const accentMap: Record<string,string> = { danger:'#ef4444', warning:'#f59e0b', info:'#6366f1', success:'#10b981' };
                    return (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',fontSize:'0.8rem',fontWeight:600,color:accentMap[alert.type]||'var(--text-muted)'}}>
                        <span style={{width:6,height:6,borderRadius:3,background:accentMap[alert.type],flexShrink:0}} />
                        {alert.message}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─── Control Panel ─── */}
              <div style={{background:'var(--card-bg)',borderRadius:14,border:'1px solid var(--border)',padding:'12px 16px',marginBottom:16}}>
                {/* Filters */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
                  {/* Month-Year Picker */}
                  <div style={{position:'relative'}}>
                    <button onClick={()=>{setShowMonthPicker(!showMonthPicker);setShowUnitPicker(false);}} style={{
                      display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:10,
                      border:showMonthPicker?'1px solid var(--primary)':'1px solid var(--border)',
                      background:showMonthPicker?'rgba(230,0,126,0.06)':'var(--bg)',color:'var(--text-main)',
                      fontWeight:700,fontSize:'0.82rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                    }}>
                      <span className="material-symbols-outlined" style={{fontSize:16,color:'var(--primary)'}}>calendar_month</span>
                      {MONTHS[d.selectedMonth]} {d.selectedYear}
                      <span className="material-symbols-outlined" style={{fontSize:14,color:'var(--text-muted)',transition:'transform 0.2s',transform:showMonthPicker?'rotate(180deg)':'none'}}>expand_more</span>
                    </button>
                    {showMonthPicker && (
                      <>
                        <div onClick={()=>setShowMonthPicker(false)} style={{position:'fixed',inset:0,zIndex:99}} />
                        <div style={{
                          position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:100,
                          background:'var(--card-bg)',borderRadius:14,border:'1px solid var(--border)',
                          boxShadow:'0 12px 36px rgba(0,0,0,0.1)',width:280,overflow:'hidden',animation:'fadeIn 0.15s ease',
                        }}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                            <button onClick={()=>d.setSelectedYear(d.selectedYear-1)} style={{width:28,height:28,borderRadius:7,border:'1px solid var(--border)',background:'var(--card-bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <span className="material-symbols-outlined" style={{fontSize:14}}>chevron_left</span>
                            </button>
                            <span style={{fontWeight:800,fontSize:'0.95rem'}}>{d.selectedYear}</span>
                            <button onClick={()=>d.setSelectedYear(d.selectedYear+1)} style={{width:28,height:28,borderRadius:7,border:'1px solid var(--border)',background:'var(--card-bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <span className="material-symbols-outlined" style={{fontSize:14}}>chevron_right</span>
                            </button>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4,padding:'12px 14px'}}>
                            {MONTHS.map((m,i)=>(
                              <button key={i} onClick={()=>{d.setSelectedMonth(i);setShowMonthPicker(false);}} style={{
                                padding:'8px 4px',borderRadius:8,border:'none',fontWeight:700,fontSize:'0.78rem',
                                cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                                background:i===d.selectedMonth?'var(--primary)':'transparent',
                                color:i===d.selectedMonth?'#fff':'var(--text-muted)',
                              }}>{m}</button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Unit selector (admin only) */}
                  {d.isDashboardAdmin && (
                    <>
                      <div style={{width:1,height:20,background:'var(--border)'}} />
                      <div style={{position:'relative'}}>
                        <button onClick={()=>{setShowUnitPicker(!showUnitPicker);setShowMonthPicker(false);}} style={{
                          display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:10,
                          border:showUnitPicker?'1px solid var(--primary)':'1px solid var(--border)',
                          background:showUnitPicker?'rgba(230,0,126,0.06)':'var(--bg)',color:'var(--text-main)',
                          fontWeight:700,fontSize:'0.82rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                        }}>
                          <span className="material-symbols-outlined" style={{fontSize:16,color:'var(--primary)'}}>location_on</span>
                          {d.selectedUnit==='all'?'Todas':d.selectedUnit}
                          <span className="material-symbols-outlined" style={{fontSize:14,color:'var(--text-muted)',transition:'transform 0.2s',transform:showUnitPicker?'rotate(180deg)':'none'}}>expand_more</span>
                        </button>
                        {showUnitPicker && (
                          <>
                            <div onClick={()=>setShowUnitPicker(false)} style={{position:'fixed',inset:0,zIndex:99}} />
                            <div style={{
                              position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:100,
                              background:'var(--card-bg)',borderRadius:12,border:'1px solid var(--border)',
                              boxShadow:'0 12px 36px rgba(0,0,0,0.1)',width:200,overflow:'hidden',animation:'fadeIn 0.15s ease',padding:'6px',
                            }}>
                              {[{value:'all',label:'Todas'},...UNITS.map(u=>({value:u,label:u}))].map(opt=>(
                                <button key={opt.value} onClick={()=>{d.setSelectedUnit(opt.value);setShowUnitPicker(false);}} style={{
                                  display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 10px',borderRadius:8,
                                  border:'none',background:d.selectedUnit===opt.value?'var(--primary)':'transparent',
                                  color:d.selectedUnit===opt.value?'#fff':'var(--text-main)',fontWeight:700,fontSize:'0.8rem',
                                  cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',textAlign:'left',
                                }}>
                                  {opt.label}
                                  {d.selectedUnit===opt.value && <span className="material-symbols-outlined" style={{fontSize:14,marginLeft:'auto'}}>check</span>}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
              </div>

              {/* Tabs removed — now in header dropdown */}
              </div>

              {/* 4 KPI Cards */}
              <motion.div
                variants={containerVariants} initial="hidden" animate="visible"
                style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:6}}
                className="dash-kpi-grid"
              >
                {[
                  {label:'Faturamento',raw:d.totalRev,prefix:'R$ ',suffix:'',color:'#10b981',sparkData:d.monthlyEvolution.map(e=>e.rev),sub:d.revVariation!==0?`${d.revVariation>0?'↑':'↓'} ${Math.abs(d.revVariation).toFixed(1)}%`:null},
                  {label:'Custos',raw:d.totalCost,prefix:'R$ ',suffix:'',color:'#ef4444',sparkData:d.monthlyEvolution.map(e=>e.cost)},
                  {label:'Lucro',raw:d.balance,prefix:'R$ ',suffix:'',color:d.balance>=0?'#10b981':'#ef4444',sparkData:d.monthlyEvolution.map(e=>e.rev-e.cost)},
                  {label:'Margem',raw:d.margin,prefix:'',suffix:'%',color:'var(--primary)',sparkData:d.monthlyEvolution.map(e=>e.rev>0?((e.rev-e.cost)/e.rev)*100:0)},
                ].map((s,i)=>(
                  <motion.div key={i} variants={cardVariants}
                    style={{...cardS,padding:'16px 18px',position:'relative',overflow:'hidden',cursor:'default'}}
                    whileHover={{y:-2,boxShadow:`0 8px 24px ${s.color}15`}}
                  >
                    <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:s.color,opacity:0.5}} />
                    {s.sparkData.length>=2 && (
                      <div style={{position:'absolute',bottom:0,right:0,opacity:0.4}}>
                        <Sparkline data={s.sparkData} color={s.color} width={80} height={32} />
                      </div>
                    )}
                    <div style={{fontSize:'0.68rem',color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6,position:'relative',zIndex:1}}>{s.label}</div>
                    <div style={{fontSize:'1.5rem',fontWeight:900,color:s.color,lineHeight:1,position:'relative',zIndex:1}}>
                      <CountUp value={s.raw} prefix={s.prefix} suffix={s.suffix} />
                    </div>
                    {s.sub&&<div style={{fontSize:'0.68rem',fontWeight:700,color:d.revVariation>0?'#10b981':'#ef4444',marginTop:4,position:'relative',zIndex:1}}>{s.sub}</div>}
                  </motion.div>
                ))}
              </motion.div>

              {/* Secondary stats inline */}
              <div style={{display:'flex',gap:16,marginBottom:16,fontSize:'0.78rem',color:'var(--text-muted)',fontWeight:600,paddingLeft:2}}>
                <span>Atendimentos: <strong style={{color:'var(--text-main)'}}><CountUpInt value={d.salesCount} /></strong></span>
                <span>·</span>
                <span>Ticket Médio: <strong style={{color:'var(--text-main)'}}><CountUp value={d.ticketMedio} prefix='R$ ' suffix='' /></strong></span>
              </div>

              {/* Goal progress — compact */}
              <div style={{...cardS,marginBottom:16,padding:'14px 18px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-main)'}}>Meta de Faturamento</span>
                  <span style={{fontSize:'0.72rem',fontWeight:600,color:'var(--text-muted)'}}>{fmt(d.totalRev)} / {fmt(d.currentGoal)} · <strong style={{color:d.goalPerc>=80?'#10b981':d.goalPerc>=30?'var(--primary)':'#ef4444'}}>{d.goalPerc.toFixed(0)}%</strong></span>
                </div>
                <div style={{height:6,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
                  <div style={{height:'100%',width:Math.min(d.goalPerc,100)+'%',background:d.goalPerc<30?'#ef4444':d.goalPerc<80?'var(--primary)':'#10b981',borderRadius:4,transition:'width 0.8s ease'}} />
                </div>
              </div>

              {/* Due Bills — compact */}
              {d.dueBills.length>0&&(
                <div style={{...cardS,marginBottom:16,padding:'14px 18px',borderLeft:'3px solid #ef4444'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <span style={{fontSize:'0.85rem',fontWeight:800,color:'var(--text-main)'}}>Contas a Pagar</span>
                    <span style={{fontSize:'0.7rem',fontWeight:700,padding:'2px 8px',borderRadius:6,background:'rgba(239,68,68,0.08)',color:'#ef4444'}}>{d.dueBills.length} pendente{d.dueBills.length>1?'s':''}</span>
                  </div>
                  {d.dueBills.slice(0,3).map(bill=>{
                    const uc = bill.isOverdue ? '#ef4444' : bill.diffDays<=1 ? '#f59e0b' : '#10b981';
                    return (
                      <div key={bill.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'0.82rem'}}>
                        <div>
                          <span style={{fontWeight:700}}>{bill.name}</span>
                          <span style={{fontSize:'0.7rem',color:uc,fontWeight:600,marginLeft:8}}>
                            {bill.isOverdue?`Vencida há ${Math.abs(bill.diffDays)}d`:bill.diffDays===0?'Hoje':bill.diffDays===1?'Amanhã':`em ${bill.diffDays}d`}
                          </span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <strong style={{color:'#ef4444'}}>{fmt(bill.value)}</strong>
                          <button onClick={()=>d.markPaid(bill.id)} style={{padding:'4px 10px',borderRadius:6,border:'none',background:'#10b981',color:'#fff',fontSize:'0.7rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Pago</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Evolução Mensal — full width */}
              <motion.div variants={sectionVariants} initial="hidden" animate="visible" style={{...cardS,marginBottom:16,padding:'16px 18px'}}>
                <div style={{fontSize:'0.85rem',fontWeight:800,marginBottom:12,color:'var(--text-main)'}}>Evolução Mensal</div>
                <div style={{height:240}}><canvas ref={d.barRef} /></div>
                {d.unitComparison.filter(uc=>uc.revenue>0).length>1&&(
                  <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid var(--border)'}}>
                    <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:8}}>Por Unidade</div>
                    {d.unitComparison.filter(uc=>uc.revenue>0).map(uc=>{
                      const total=d.unitComparison.reduce((s,u)=>s+u.revenue,0)||1;
                      const pct=(uc.revenue/total)*100;
                      return (
                        <div key={uc.unit} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                          <span style={{fontSize:'0.72rem',fontWeight:700,width:60,flexShrink:0}}>{uc.unit}</span>
                          <div style={{flex:1,height:6,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
                            <div style={{height:'100%',width:pct+'%',background:UNIT_COLORS[uc.unit]||'#999',borderRadius:4,transition:'width 0.6s'}} />
                          </div>
                          <span style={{fontSize:'0.68rem',fontWeight:600,color:'var(--text-muted)',width:60,textAlign:'right'}}>{fmt(uc.revenue)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>

              {/* Retenção — horizontal compact strip */}
              <div style={{...cardS,marginBottom:16,padding:'14px 18px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                <div style={{position:'relative',width:52,height:52,flexShrink:0}}>
                  <svg viewBox="0 0 52 52" width="52" height="52">
                    <circle cx="26" cy="26" r="20" fill="none" stroke="var(--border)" strokeWidth="6" />
                    <circle cx="26" cy="26" r="20" fill="none" stroke="url(#retGrad2)" strokeWidth="6"
                      strokeDasharray={`${(d.clientRetention.rate/100)*125.66} 125.66`}
                      strokeLinecap="round"
                      style={{transform:'rotate(-90deg)',transformOrigin:'26px 26px',transition:'stroke-dasharray 0.8s'}}
                    />
                    <defs><linearGradient id="retGrad2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#e91e63" /><stop offset="100%" stopColor="#a855f7" /></linearGradient></defs>
                  </svg>
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:'0.7rem',fontWeight:900,color:'var(--primary)'}}>{d.clientRetention.rate.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-main)'}}>Retenção</div>
                <div style={{display:'flex',gap:16,flex:1,justifyContent:'flex-end',flexWrap:'wrap'}}>
                  {[
                    {label:'Únicos',value:d.clientRetention.total,color:'#6366f1'},
                    {label:'Recorrentes',value:d.clientRetention.returning,color:'#10b981'},
                    {label:'Novos',value:d.clientRetention.new,color:'#3b82f6'},
                  ].map(s=>(
                    <div key={s.label} style={{textAlign:'center'}}>
                      <div style={{fontSize:'1.1rem',fontWeight:900,color:s.color}}>{s.value}</div>
                      <div style={{fontSize:'0.62rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase'}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rankings: Procedimentos + Clientes */}
              <div className="dashboard-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div style={{...cardS,padding:'16px 18px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <span style={{fontSize:'0.85rem',fontWeight:800}}>Ranking de Procedimentos</span>
                    <div style={{display:'flex',gap:3}}>
                      {['Todas',...UNITS].map(tab=>(
                        <button key={tab} onClick={()=>setRankingTab(tab)} style={{
                          padding:'3px 8px',borderRadius:6,border:'1px solid var(--border)',fontSize:'0.65rem',fontWeight:700,
                          background:rankingTab===tab?'var(--primary)':'transparent',color:rankingTab===tab?'#fff':'var(--text-muted)',
                          cursor:'pointer',fontFamily:'inherit',
                        }}>{tab}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{position:'relative',marginBottom:8}}>
                    <span className="material-symbols-outlined" style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'var(--text-muted)'}}>search</span>
                    <input value={procSearch} onChange={e=>setProcSearch(e.target.value)} placeholder="Buscar..." style={{width:'100%',padding:'6px 10px 6px 28px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text-main)',fontSize:'0.75rem',outline:'none',fontFamily:'inherit'}} />
                  </div>
                  {(()=>{
                    const rawList=rankingTab==='Todas'?d.procRanking:(d.procByUnit[rankingTab]||[]);
                    const filtered=procSearch?rawList.filter(p=>p.name.toLowerCase().includes(procSearch.toLowerCase())):rawList;
                    const display=showAllProcs?filtered:filtered.slice(0,5);
                    const maxRev=filtered[0]?.revenue||1;
                    return filtered.length===0?<p style={{textAlign:'center',color:'var(--text-muted)',padding:12,fontSize:'0.8rem'}}>Nenhum encontrado.</p>:(
                      <>
                        {display.map((proc,i)=>{
                          const p=(proc.revenue/maxRev)*100;
                          return (
                            <div key={proc.name} style={{marginBottom:8}}>
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',fontWeight:600,marginBottom:2,alignItems:'center'}}>
                                <span style={{display:'flex',alignItems:'center',gap:6}}>
                                  <span style={{width:18,height:18,borderRadius:5,background:i<3&&!procSearch?['#f59e0b','#94a3b8','#d97706'][i]:'var(--border)',color:i<3&&!procSearch?'#fff':'var(--text-muted)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'0.6rem',fontWeight:800,flexShrink:0}}>{i+1}</span>
                                  {proc.name}
                                </span>
                                <span style={{fontWeight:800,fontSize:'0.78rem'}}>{fmt(proc.revenue)}</span>
                              </div>
                              <div style={{height:4,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                                <div style={{height:'100%',width:p+'%',background:'var(--primary)',borderRadius:3,transition:'width 0.5s'}} />
                              </div>
                            </div>
                          );
                        })}
                        {filtered.length>5&&(
                          <button onClick={()=>setShowAllProcs(!showAllProcs)} style={{width:'100%',padding:'6px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--primary)',fontWeight:700,fontSize:'0.72rem',cursor:'pointer',fontFamily:'inherit'}}>
                            {showAllProcs?'Top 5 ▲':`Todos (${filtered.length}) ▼`}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div style={{...cardS,padding:'16px 18px'}}>
                  <span style={{fontSize:'0.85rem',fontWeight:800,display:'block',marginBottom:12}}>Top Clientes</span>
                  <div style={{position:'relative',marginBottom:8}}>
                    <span className="material-symbols-outlined" style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'var(--text-muted)'}}>search</span>
                    <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Buscar..." style={{width:'100%',padding:'6px 10px 6px 28px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text-main)',fontSize:'0.75rem',outline:'none',fontFamily:'inherit'}} />
                  </div>
                  {(()=>{
                    const filtered=clientSearch?d.topClients.filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())):d.topClients;
                    const display=showAllClients?filtered:filtered.slice(0,5);
                    const maxSpent=filtered[0]?.totalSpent||1;
                    return filtered.length===0?<p style={{textAlign:'center',color:'var(--text-muted)',padding:12,fontSize:'0.8rem'}}>Nenhum encontrado.</p>:(
                      <>
                        {display.map((client,i)=>{
                          const p=(client.totalSpent/maxSpent)*100;
                          return (
                            <div key={client.name} style={{marginBottom:8}}>
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',fontWeight:600,marginBottom:2}}>
                                <span>{i<3&&!clientSearch?['🥇','🥈','🥉'][i]+' ':''}{client.name}</span>
                                <span style={{fontWeight:800,color:'#10b981'}}>{fmt(client.totalSpent)}</span>
                              </div>
                              <div style={{height:4,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                                <div style={{height:'100%',width:p+'%',background:'linear-gradient(90deg,#6366f1,#8b5cf6)',borderRadius:3,transition:'width 0.5s'}} />
                              </div>
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.65rem',color:'var(--text-muted)',marginTop:1}}>
                                <span>{client.count} compra{client.count>1?'s':''}</span>
                                <span>{client.lastDate?new Date(client.lastDate).toLocaleDateString('pt-BR'):''}</span>
                              </div>
                            </div>
                          );
                        })}
                        {filtered.length>5&&(
                          <button onClick={()=>setShowAllClients(!showAllClients)} style={{width:'100%',padding:'6px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'#6366f1',fontWeight:700,fontSize:'0.72rem',cursor:'pointer',fontFamily:'inherit'}}>
                            {showAllClients?'Top 5 ▲':`Todos (${filtered.length}) ▼`}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Despesas por Categoria + Últimos Lançamentos */}
              <div className="dashboard-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div style={{...cardS,padding:'16px 18px'}}>
                  <span style={{fontSize:'0.85rem',fontWeight:800,display:'block',marginBottom:12}}>Despesas por Categoria</span>
                  {d.sortedCostCats.length===0?<p style={{textAlign:'center',color:'var(--text-muted)',padding:12,fontSize:'0.8rem'}}>Nenhuma despesa.</p>:(
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {d.sortedCostCats.slice(0,6).map(([cat,val],i)=>{
                        const pct=d.totalCost>0?(val/d.totalCost)*100:0;
                        return (
                          <div key={cat}>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',fontWeight:600,marginBottom:2}}>
                              <span style={{display:'flex',alignItems:'center',gap:5}}>
                                <span style={{width:6,height:6,borderRadius:3,background:CAT_COLORS[i%CAT_COLORS.length],display:'inline-block'}} />{cat}
                              </span>
                              <span>{fmt(val)} <span style={{color:'var(--text-muted)',fontSize:'0.68rem'}}>({pct.toFixed(0)}%)</span></span>
                            </div>
                            <div style={{height:4,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                              <div style={{height:'100%',width:pct+'%',background:CAT_COLORS[i%CAT_COLORS.length],borderRadius:3,transition:'width 0.5s'}} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{...cardS,padding:'16px 18px'}}>
                  <span style={{fontSize:'0.85rem',fontWeight:800,display:'block',marginBottom:12}}>Últimos Lançamentos</span>
                  <div style={{display:'flex',flexDirection:'column'}}>
                    {[...d.fixedExpenses.map(e=>({...e,type:'expense' as const,date:''})),...d.filteredLogs.slice().reverse()].slice(0,5).map((item,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:i<4?'1px solid var(--border)':'none'}}>
                        <span style={{width:6,height:6,borderRadius:3,background:item.type==='sale'?'#10b981':'#ef4444',flexShrink:0}} />
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'0.78rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                          <div style={{fontSize:'0.65rem',color:'var(--text-muted)',display:'flex',gap:4}}>
                            {item.date&&<span>{new Date(item.date).toLocaleDateString('pt-BR')}</span>}
                            {'category' in item&&item.category&&<span>· {item.category}</span>}
                          </div>
                        </div>
                        <strong style={{fontSize:'0.8rem',color:item.type==='sale'?'#10b981':'#ef4444',flexShrink:0}}>
                          {item.type==='sale'?'+':'-'}{fmt(item.value)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}


          {d.activeTab==='sales'&&<SalesSection saleName={d.saleName} setSaleName={d.setSaleName} saleValue={d.saleValue} setSaleValue={d.setSaleValue} saleDate={d.saleDate} setSaleDate={d.setSaleDate} salePayment={d.salePayment} setSalePayment={d.setSalePayment} saleUnit={d.saleUnit} setSaleUnit={d.setSaleUnit} saleObs={d.saleObs} setSaleObs={d.setSaleObs} saleSeller={d.saleSeller} setSaleSeller={d.setSaleSeller} addSale={d.addSale} items={d.filteredLogs} deleteLogByDate={d.deleteLogByDate} updateLog={d.updateLog} clearSalesByUnit={d.clearSalesByUnit} clearAllSales={d.clearAllSales} clearSalesByUnitAllMonths={d.clearSalesByUnitAllMonths} clearAllSalesAllMonths={d.clearAllSalesAllMonths} selectedMonth={d.selectedMonth} selectedYear={d.selectedYear} />}

          {d.activeTab==='goals'&&<GoalsSection selectedMonth={d.selectedMonth} goalInput={d.goalInput} setGoalInput={d.setGoalInput} goalUnits={d.goalUnits} setGoalUnits={d.setGoalUnits} handleSaveGoal={d.handleSaveGoal} />}
          {d.activeTab==='reports'&&<ReportsSection totalRev={d.totalRev} totalCost={d.totalCost} balance={d.balance} sortedProcs={d.sortedProcs} filteredLogs={d.filteredLogs} showClearModal={d.showClearModal} setShowClearModal={d.setShowClearModal} clearAll={d.clearAll} selectedMonth={d.selectedMonth} selectedYear={d.selectedYear} monthlyEvolution={d.monthlyEvolution} margin={d.margin} />}
          {d.activeTab==='analytics'&&<AnalyticsSection logs={d.logs} selectedMonth={d.selectedMonth} selectedYear={d.selectedYear} selectedUnit={d.selectedUnit} />}
        </main>

        <footer style={{padding:'20px 24px',borderTop:'1px solid var(--border)',textAlign:'center',marginTop:40}}>
          <p style={{margin:0,fontSize:'0.82rem',color:'var(--text-muted)'}}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>

        <PaymentReminder dueBills={d.dueBills} showPopup={d.showPopup} setShowPopup={d.setShowPopup} showMiniBell={d.showMiniBell} setShowMiniBell={d.setShowMiniBell} markPaid={d.markPaid} />

        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.3); }
          }
          .dash-fade-in > div { animation: fadeSlideUp 0.4s ease both; }
          .dash-fade-in > div:nth-child(2) { animation-delay: 0.05s; }
          .dash-fade-in > div:nth-child(3) { animation-delay: 0.1s; }
          .dash-fade-in > div:nth-child(4) { animation-delay: 0.15s; }
          .dash-fade-in > div:nth-child(5) { animation-delay: 0.2s; }
          .dash-fade-in > div:nth-child(6) { animation-delay: 0.25s; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (max-width: 768px) {
            .dashboard-grid-2col { grid-template-columns: 1fr !important; }
            .dash-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
