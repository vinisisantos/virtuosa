'use client';
import { useState, useEffect, useMemo } from 'react';
import { FixedExpense, Bill, fmt, FIXED_CATEGORIES, BILL_CATEGORIES, UNITS, cardS, inputS, labelS, btnPrimary, formatCurrency } from '@/hooks/useDashboard';
import { calcularFolha, DEFAULT_SETTINGS, formatBRL } from '@/lib/payroll-calc';
import type { SmartEmployee, PayrollSettings } from '@/lib/payroll-calc';

interface Props {
  fixedExpenses:FixedExpense[];
  fixedName:string; setFixedName:(v:string)=>void;
  fixedValue:string; setFixedValue:(v:string)=>void;
  fixedCategory:string; setFixedCategory:(v:string)=>void;
  fixedDate:string; setFixedDate:(v:string)=>void;
  fixedUnit:string; setFixedUnit:(v:string)=>void;
  addFixed:()=>void; deleteFixed:(id:number)=>void; editFixed:(id:number, data:Partial<FixedExpense>)=>void;
  bills:Bill[];
  billName:string; setBillName:(v:string)=>void;
  billValue:string; setBillValue:(v:string)=>void;
  billType:'fixo'|'variavel'; setBillType:(v:'fixo'|'variavel')=>void;
  billDueDay:string; setBillDueDay:(v:string)=>void;
  billDueDate:string; setBillDueDate:(v:string)=>void;
  billCategory:string; setBillCategory:(v:string)=>void;
  addBill:()=>void; deleteBill:(id:number)=>void;
  hideBills?: boolean;
  hideFixed?: boolean;
  totalRev?: number;
  selectedUnit?: string;
}

/* Category icon + color map */
const CAT_META: Record<string,{icon:string;color:string}> = {
  'Aluguel':      {icon:'home',          color:'#8b5cf6'},
  'Salários':     {icon:'badge',         color:'#3b82f6'},
  'Internet':    {icon:'wifi',               color:'#f59e0b'},
  'Luz':          {icon:'bolt',               color:'#eab308'},
  'Impostos':     {icon:'account_balance',color:'#ef4444'},
  'Fornecedores': {icon:'local_shipping', color:'#14b8a6'},
  'Marketing':    {icon:'campaign',      color:'#ec4899'},
  'Segurança':    {icon:'security',      color:'#0ea5e9'},
  'Sistema':      {icon:'computer',      color:'#6366f1'},
  'Contabilidade':{icon:'calculate',     color:'#84cc16'},
  'Royalties':    {icon:'license',       color:'#d946ef'},
  'Água':         {icon:'water_drop',    color:'#06b6d4'},
  'Parcela':      {icon:'credit_card',   color:'#e11d48'},
  'Folha de Pagamento': {icon:'payments', color:'#6366f1'},
  'Outros':       {icon:'more_horiz',    color:'#6b7280'},
};
const getCat = (cat?:string) => CAT_META[cat||''] || {icon:'receipt',color:'var(--text-muted)'};

const focusIn = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--primary)';
  e.target.style.boxShadow = '0 0 0 4px rgba(230,0,126,0.1)';
  e.target.style.transform = 'translateY(-1px)';
};
const focusOut = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--border)';
  e.target.style.boxShadow = 'none';
  e.target.style.transform = 'translateY(0)';
};

export function FixedCostsSection(p:Props) {
  const [fixedSuccess, setFixedSuccess] = useState(false);
  const [billSuccess, setBillSuccess] = useState(false);
  const [fixedFormCollapsed, setFixedFormCollapsed] = useState(false);
  const [billFormCollapsed, setBillFormCollapsed] = useState(false);
  const [fixedListCollapsed, setFixedListCollapsed] = useState(false);
  const [billListCollapsed, setBillListCollapsed] = useState(false);
  const selectedUnit = p.selectedUnit || 'all';
  const [editingItem, setEditingItem] = useState<FixedExpense|null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editDate, setEditDate] = useState('');

  const handleAddFixed = () => { p.addFixed(); setFixedSuccess(true); setTimeout(() => setFixedSuccess(false), 2000); };
  const handleAddBill = () => { p.addBill(); setBillSuccess(true); setTimeout(() => setBillSuccess(false), 2000); };

  // ─── Payroll Integration ───
  const folhaTotal = useMemo(() => {
    try {
      const empRaw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_smart_employees') : null;
      const setRaw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_payroll_settings') : null;
      const employees: SmartEmployee[] = empRaw ? JSON.parse(empRaw) : [];
      const settings: PayrollSettings = setRaw ? JSON.parse(setRaw) : DEFAULT_SETTINGS;
      return employees.filter(e => e.status === 'ativo' && (selectedUnit === 'all' || e.unidade === selectedUnit))
        .reduce((sum, emp) => sum + calcularFolha(emp, settings).custoTotal, 0);
    } catch { return 0; }
  }, [selectedUnit]);

  // Filter by unit
  const filteredFixed = selectedUnit === 'all' ? p.fixedExpenses : p.fixedExpenses.filter(e => (e.unit || '') === selectedUnit);
  const filteredBills = p.bills; // bills don't have unit yet

  const totalFixed = filteredFixed.reduce((s,e) => s + e.value, 0);
  const totalBills = filteredBills.reduce((s,b) => s + b.value, 0);
  const fixedCount = filteredFixed.length;
  const billCount = filteredBills.length;
  const totalMonthly = totalFixed + totalBills + folhaTotal;

  /* Category breakdown for fixed — includes folha */
  const catTotals: Record<string,number> = {};
  filteredFixed.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + e.value; });
  if (folhaTotal > 0) catTotals['Folha de Pagamento'] = folhaTotal;

  /* All items for chart (individual fixed costs + folha) */
  const chartItems: {label:string;value:number;color:string;icon:string}[] = [];
  filteredFixed.forEach(e => {
    const cat = getCat(e.category);
    chartItems.push({label: e.name, value: e.value, color: cat.color, icon: cat.icon});
  });
  if (folhaTotal > 0) chartItems.push({label:'Folha de Pagamento', value: folhaTotal, color:'#6366f1', icon:'payments'});
  filteredBills.forEach(b => {
    chartItems.push({label: b.name, value: b.value, color:'#9c27b0', icon:'event_upcoming'});
  });
  const chartMax = Math.max(...chartItems.map(i => i.value), 1);

  return (
    <div>
      {/* Mini KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16}}>
        {[
          {label:'Custos Fixos',value:fmt(totalFixed),icon:'repeat',color:'#8b5cf6',sub:`${fixedCount} itens`},
          {label:'Contas',value:fmt(totalBills),icon:'event_upcoming',color:'#9c27b0',sub:`${billCount} contas`},
          {label:'Folha',value:fmt(folhaTotal),icon:'payments',color:'#6366f1',sub:'Da Folha Inteligente'},
          {label:'Total Mensal',value:fmt(totalMonthly),icon:'account_balance_wallet',color:'#ef4444',sub:'Custos + Contas + Folha'},
          {label:'Caixa',value:fmt(Math.max(0, (p.totalRev || 0) - totalMonthly)),icon:'savings',color: (p.totalRev || 0) - totalMonthly >= 0 ? '#10b981' : '#ef4444',sub: (p.totalRev || 0) > 0 ? `${(((p.totalRev || 0) - totalMonthly) / (p.totalRev || 1) * 100).toFixed(1)}% livre` : 'Sem faturamento'},
        ].map((kpi,i) => (
          <div key={i} style={{...cardS,padding:14,position:'relative',overflow:'hidden',transition:'all 0.2s'}}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform='translateY(0)'}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${kpi.color},${kpi.color}66)`}} />
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <span style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>{kpi.label}</span>
              <div style={{width:30,height:30,borderRadius:10,background:`${kpi.color}12`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span className="material-symbols-outlined" style={{fontSize:16,color:kpi.color}}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{fontSize:'1.15rem',fontWeight:900,color:kpi.color,lineHeight:1.1}}>{kpi.value}</div>
            <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2,fontWeight:600}}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Fixed Expenses - Collapsible Form */}
      {!p.hideFixed && (<>
      <div style={{...cardS, position:'relative', overflow:'hidden'}}>
        {fixedSuccess && (
          <div style={{ position:'absolute', inset:0, background:'rgba(16,185,129,0.08)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span className="material-symbols-outlined" style={{ fontSize:32, color:'#10b981' }}>check_circle</span>
              <span style={{ fontSize:'1.1rem', fontWeight:800, color:'#10b981' }}>Custo fixo adicionado!</span>
            </div>
          </div>
        )}

        <div onClick={() => setFixedFormCollapsed(!fixedFormCollapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',userSelect:'none'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{ width:42, height:42, borderRadius:14, background:'linear-gradient(135deg,#8b5cf6,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(139,92,246,0.3)' }}>
              <span className="material-symbols-outlined" style={{fontSize:20,color:'#fff'}}>account_balance</span>
            </div>
            <div>
              <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:800}}>Custos Fixos Mensais</h2>
              <p style={{margin:0,fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:600}}>{fixedFormCollapsed ? 'Clique para expandir' : 'Despesas que se repetem todo mês'}</p>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {totalFixed > 0 && <span style={{fontSize:'0.75rem',fontWeight:800,padding:'4px 12px',borderRadius:8,background:'rgba(139,92,246,0.08)',color:'#8b5cf6'}}>{fmt(totalFixed)}/mês</span>}
            <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--text-muted)',transition:'transform 0.3s',transform:fixedFormCollapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
          </div>
        </div>

        <div style={{maxHeight:fixedFormCollapsed?0:600,opacity:fixedFormCollapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:fixedFormCollapsed?0:24}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#8b5cf6'}}>description</span>Descrição</label>
              <input value={p.fixedName} onChange={e=>p.setFixedName(e.target.value)} placeholder="Ex: Aluguel, Internet" style={inputS} onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#8b5cf6'}}>category</span>Categoria</label>
              <select value={p.fixedCategory} onChange={e=>p.setFixedCategory(e.target.value)} style={{...inputS,height:46,appearance:'auto'}} onFocus={focusIn} onBlur={focusOut}>{FIXED_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#8b5cf6'}}>payments</span>Valor Mensal (R$)</label>
              <input value={p.fixedValue} onChange={e=>p.setFixedValue(formatCurrency(e.target.value))} placeholder="0,00" style={inputS} inputMode="numeric" onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#8b5cf6'}}>location_on</span>Unidade</label>
              <select value={p.fixedUnit} onChange={e=>p.setFixedUnit(e.target.value)} style={{...inputS,height:46,appearance:'auto'}} onFocus={focusIn} onBlur={focusOut}>{UNITS.map(u=><option key={u}>{u}</option>)}</select>
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#8b5cf6'}}>calendar_month</span>Data</label>
              <input type="date" value={p.fixedDate} onChange={e=>p.setFixedDate(e.target.value)} style={inputS} onFocus={focusIn} onBlur={focusOut} />
            </div>
          </div>
          <button onClick={handleAddFixed}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 25px rgba(139,92,246,0.35)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 15px rgba(139,92,246,0.25)';}}
            style={{...btnPrimary,marginTop:16,maxWidth:320,background:'linear-gradient(135deg,#8b5cf6,#a78bfa)',boxShadow:'0 4px 15px rgba(139,92,246,0.25)'}}>
            <span className="material-symbols-outlined">add_task</span> Adicionar Custo Fixo
          </button>
        </div>
      </div>

      {/* Fixed Expenses List */}
      <div style={{...cardS,marginTop:16}}>
        <div onClick={() => setFixedListCollapsed(!fixedListCollapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',userSelect:'none'}}>
          <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#8b5cf6',fontSize:18}}>repeat</span>
            Custos Fixos ({fixedCount})
          </h2>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {totalFixed > 0 && <span style={{fontSize:'0.75rem',fontWeight:800,padding:'4px 12px',borderRadius:8,background:'rgba(139,92,246,0.08)',color:'#8b5cf6'}}>{fmt(totalFixed)}/mês</span>}
            <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--text-muted)',transition:'transform 0.3s',transform:fixedListCollapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
          </div>
        </div>
        <div style={{maxHeight:fixedListCollapsed?0:5000,opacity:fixedListCollapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:fixedListCollapsed?0:12}}>
        <ul style={{listStyle:'none',padding:0,margin:0}}>
          {fixedCount === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:40, color:'var(--border)', display:'block', marginBottom:8 }}>account_balance</span>
              <p style={{color:'var(--text-muted)',fontSize:'0.88rem',fontWeight:600}}>Nenhum custo fixo cadastrado.</p>
            </div>
          ) : filteredFixed.map((item, i) => {
            const cat = getCat(item.category);
            return (
            <li key={item.id} style={{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'12px 14px',borderRadius:12,marginBottom:4,
              background: i%2===0 ? 'transparent' : 'rgba(0,0,0,0.015)',
              transition:'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.03)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i%2===0 ? 'transparent' : 'rgba(0,0,0,0.015)'}
            >
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:`${cat.color}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span className="material-symbols-outlined" style={{fontSize:16,color:cat.color}}>{cat.icon}</span>
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.88rem'}}>{item.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',marginTop:2}}>
                    <span style={{background:`${cat.color}10`,color:cat.color,padding:'1px 8px',borderRadius:6,fontSize:'0.68rem',fontWeight:600}}>{item.category}</span>
                    {item.unit && <span style={{background:'rgba(99,102,241,0.06)',color:'#6366f1',padding:'1px 8px',borderRadius:6,fontSize:'0.68rem',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><span className="material-symbols-outlined" style={{fontSize:11}}>location_on</span>{item.unit}</span>}
                    {item.date && <span style={{background:'rgba(245,158,11,0.06)',color:'#f59e0b',padding:'1px 8px',borderRadius:6,fontSize:'0.68rem',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><span className="material-symbols-outlined" style={{fontSize:11}}>calendar_month</span>{new Date(item.date+'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{textAlign:'right'}}>
                  <strong style={{color:'#ef4444',fontWeight:800,fontSize:'0.95rem'}}>{fmt(item.value)}</strong>
                  <div style={{fontSize:'0.65rem',color:'var(--text-muted)',fontWeight:600}}>/mês</div>
                </div>
                <button onClick={()=>{ setEditingItem(item); setEditName(item.name); setEditValue(item.value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})); setEditCategory(item.category); setEditUnit(item.unit||''); setEditDate(item.date||''); }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.15)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.05)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  style={{width:34,height:34,borderRadius:10,border:'1px solid rgba(245,158,11,0.2)',background:'rgba(245,158,11,0.05)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
                  <span className="material-symbols-outlined" style={{fontSize:16,color:'#f59e0b'}}>edit</span>
                </button>
                <button onClick={()=>p.deleteFixed(item.id)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  style={{width:34,height:34,borderRadius:10,border:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.05)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
                  <span className="material-symbols-outlined" style={{fontSize:16,color:'#ef4444'}}>delete</span>
                </button>
              </div>
            </li>
          );})}
        </ul>
        </div>
      </div>

      {/* ─── Bar Chart Breakdown ─── */}
      {chartItems.length > 0 && (
        <div style={{...cardS, marginTop:16, padding:'20px 24px'}}>
          <h2 style={{margin:'0 0 16px',fontSize:'1.05rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#3b82f6',fontSize:18}}>bar_chart</span>
            Detalhamento dos Custos Fixos
            <span style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',marginLeft:'auto'}}>{fmt(totalMonthly)} total</span>
          </h2>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {chartItems.sort((a,b) => b.value - a.value).map((item, i) => {
              const pct = totalMonthly > 0 ? (item.value / totalMonthly) * 100 : 0;
              return (
                <div key={i}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:26,height:26,borderRadius:8,background:`${item.color}12`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <span className="material-symbols-outlined" style={{fontSize:13,color:item.color}}>{item.icon}</span>
                      </div>
                      <span style={{fontSize:'0.82rem',fontWeight:700,color:'var(--text-main)'}}>{item.label}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:'0.78rem',fontWeight:800,color:item.color}}>{fmt(item.value)}</span>
                      <span style={{fontSize:'0.68rem',fontWeight:700,padding:'2px 8px',borderRadius:6,background:`${item.color}10`,color:item.color}}>{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div style={{height:8,borderRadius:4,background:'var(--border)',overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:4,background:`linear-gradient(90deg, ${item.color}, ${item.color}99)`,width:`${pct}%`,transition:'width 0.6s ease',minWidth: pct > 0 ? 4 : 0}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>)}

      {/* Section Divider */}
      {!p.hideBills && (<>
      <div style={{ display:'flex', alignItems:'center', gap:12, margin:'28px 0 16px' }}>
        <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--border), transparent)' }} />
        <span style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-muted)', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
          <span className="material-symbols-outlined" style={{fontSize:16,color:'#9c27b0'}}>event_upcoming</span>
          Contas com Vencimento
        </span>
        <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--border), transparent)' }} />
      </div>

      {/* Bills Form - Collapsible */}
      <div style={{...cardS, position:'relative', overflow:'hidden'}}>
        {billSuccess && (
          <div style={{ position:'absolute', inset:0, background:'rgba(16,185,129,0.08)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span className="material-symbols-outlined" style={{ fontSize:32, color:'#10b981' }}>check_circle</span>
              <span style={{ fontSize:'1.1rem', fontWeight:800, color:'#10b981' }}>Conta cadastrada!</span>
            </div>
          </div>
        )}

        <div onClick={() => setBillFormCollapsed(!billFormCollapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',userSelect:'none'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{ width:42, height:42, borderRadius:14, background:'linear-gradient(135deg,#9c27b0,#ce93d8)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(156,39,176,0.3)' }}>
              <span className="material-symbols-outlined" style={{fontSize:20,color:'#fff'}}>event_upcoming</span>
            </div>
            <div>
              <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:800}}>Cadastrar Conta</h2>
              <p style={{margin:0,fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:600}}>{billFormCollapsed ? 'Clique para expandir' : 'Contas com data de vencimento'}</p>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {totalBills > 0 && <span style={{fontSize:'0.75rem',fontWeight:800,padding:'4px 12px',borderRadius:8,background:'rgba(156,39,176,0.08)',color:'#9c27b0'}}>{billCount} contas</span>}
            <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--text-muted)',transition:'transform 0.3s',transform:billFormCollapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
          </div>
        </div>

        <div style={{maxHeight:billFormCollapsed?0:600,opacity:billFormCollapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:billFormCollapsed?0:24}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#9c27b0'}}>receipt_long</span>Nome da Conta</label>
              <input value={p.billName} onChange={e=>p.setBillName(e.target.value)} placeholder="Ex: Aluguel, Internet" style={inputS} onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#9c27b0'}}>payments</span>Valor (R$)</label>
              <input value={p.billValue} onChange={e=>p.setBillValue(formatCurrency(e.target.value))} placeholder="0,00" style={inputS} inputMode="numeric" onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#9c27b0'}}>category</span>Categoria</label>
              <select value={p.billCategory} onChange={e=>p.setBillCategory(e.target.value)} style={{...inputS,height:46,appearance:'auto'}} onFocus={focusIn} onBlur={focusOut}>{BILL_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#9c27b0'}}>swap_horiz</span>Tipo</label>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>p.setBillType('fixo')} style={{
                  flex:1,padding:'10px 12px',borderRadius:12,
                  border:p.billType==='fixo'?'2px solid #9c27b0':'2px solid var(--border)',
                  background:p.billType==='fixo'?'rgba(156,39,176,0.08)':'var(--bg)',
                  color:p.billType==='fixo'?'#9c27b0':'var(--text-muted)',
                  fontWeight:700,fontSize:'0.78rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                }}>Fixo (mensal)</button>
                <button onClick={()=>p.setBillType('variavel')} style={{
                  flex:1,padding:'10px 12px',borderRadius:12,
                  border:p.billType==='variavel'?'2px solid #9c27b0':'2px solid var(--border)',
                  background:p.billType==='variavel'?'rgba(156,39,176,0.08)':'var(--bg)',
                  color:p.billType==='variavel'?'#9c27b0':'var(--text-muted)',
                  fontWeight:700,fontSize:'0.78rem',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                }}>Variável</button>
              </div>
            </div>
            {p.billType==='fixo'?(
              <div>
                <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#9c27b0'}}>today</span>Dia Vencimento (1-31)</label>
                <input type="number" value={p.billDueDay} onChange={e=>p.setBillDueDay(e.target.value)} min={1} max={31} placeholder="15" style={inputS} onFocus={focusIn} onBlur={focusOut} />
              </div>
            ):(
              <div>
                <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'#9c27b0'}}>event</span>Data de Vencimento</label>
                <input type="date" value={p.billDueDate} onChange={e=>p.setBillDueDate(e.target.value)} style={inputS} onFocus={focusIn} onBlur={focusOut} />
              </div>
            )}
          </div>
          <button onClick={handleAddBill}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 25px rgba(156,39,176,0.35)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 15px rgba(156,39,176,0.25)';}}
            style={{...btnPrimary,marginTop:16,maxWidth:320,background:'linear-gradient(135deg,#9c27b0,#ce93d8)',boxShadow:'0 4px 15px rgba(156,39,176,0.25)'}}>
            <span className="material-symbols-outlined">event_available</span> Cadastrar Conta
          </button>
        </div>
      </div>

      {/* Bills List */}
      <div style={{...cardS,marginTop:16}}>
        <div onClick={() => setBillListCollapsed(!billListCollapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',userSelect:'none'}}>
          <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#9c27b0',fontSize:18}}>event_note</span>
            Contas Cadastradas ({billCount})
          </h2>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {totalBills > 0 && <span style={{fontSize:'0.75rem',fontWeight:800,padding:'4px 12px',borderRadius:8,background:'rgba(156,39,176,0.08)',color:'#9c27b0'}}>{fmt(totalBills)}</span>}
            <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--text-muted)',transition:'transform 0.3s',transform:billListCollapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
          </div>
        </div>
        <div style={{maxHeight:billListCollapsed?0:5000,opacity:billListCollapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:billListCollapsed?0:12}}>
        <ul style={{listStyle:'none',padding:0,margin:0}}>
          {billCount===0?(
            <div style={{ textAlign:'center', padding:'32px 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:40, color:'var(--border)', display:'block', marginBottom:8 }}>event_note</span>
              <p style={{color:'var(--text-muted)',fontSize:'0.88rem',fontWeight:600}}>Nenhuma conta cadastrada.</p>
            </div>
          ):p.bills.map((b,i)=>(
            <li key={b.id} style={{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'12px 14px',borderRadius:12,marginBottom:4,
              background: i%2===0 ? 'transparent' : 'rgba(0,0,0,0.015)',
              transition:'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(156,39,176,0.03)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i%2===0 ? 'transparent' : 'rgba(0,0,0,0.015)'}
            >
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:b.type==='fixo'?'rgba(16,185,129,0.08)':'rgba(156,39,176,0.08)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span className="material-symbols-outlined" style={{fontSize:16,color:b.type==='fixo'?'#10b981':'#9c27b0'}}>{b.type==='fixo'?'repeat':'event'}</span>
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.88rem'}}>
                    {b.name}{' '}
                    <span style={{
                      background:b.type==='fixo'?'rgba(16,185,129,0.08)':'rgba(156,39,176,0.08)',
                      padding:'2px 8px',borderRadius:6,fontSize:'0.65rem',fontWeight:700,
                      color:b.type==='fixo'?'#10b981':'#9c27b0',
                    }}>{b.type==='fixo'?'Fixo':'Variável'}</span>
                  </div>
                  <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:2,display:'flex',gap:6}}>
                    <span>{b.type==='fixo'?`Todo dia ${b.dueDay}`:`Vence em ${b.dueDateManual?new Date(b.dueDateManual+'T12:00:00').toLocaleDateString('pt-BR'):''}`}</span>
                    <span style={{background:'rgba(156,39,176,0.06)',padding:'1px 6px',borderRadius:5,fontSize:'0.65rem',fontWeight:600}}>{b.category}</span>
                  </div>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <strong style={{fontWeight:800,fontSize:'0.95rem',color:'#ef4444'}}>{fmt(b.value)}</strong>
                <button onClick={()=>p.deleteBill(b.id)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  style={{width:34,height:34,borderRadius:10,border:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.05)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
                  <span className="material-symbols-outlined" style={{fontSize:16,color:'#ef4444'}}>delete</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
        </div>
      </div>
      </>)}

      {/* ─── Edit Fixed Cost Modal ─── */}
      {editingItem && (
        <div onClick={() => setEditingItem(null)} style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(6px)',display:'flex',justifyContent:'center',alignItems:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{...cardS,maxWidth:500,width:'100%',padding:'20px 24px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
                <span className="material-symbols-outlined" style={{color:'#f59e0b'}}>edit</span>Editar Custo Fixo
              </h2>
              <button onClick={() => setEditingItem(null)} style={{width:32,height:32,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span className="material-symbols-outlined" style={{fontSize:16}}>close</span>
              </button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'span 2'}}>
                <label style={labelS}>Descrição</label>
                <input value={editName} onChange={e=>setEditName(e.target.value)} style={inputS} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <div>
                <label style={labelS}>Valor (R$)</label>
                <input value={editValue} onChange={e=>setEditValue(formatCurrency(e.target.value))} inputMode="numeric" style={inputS} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <div>
                <label style={labelS}>Categoria</label>
                <select value={editCategory} onChange={e=>setEditCategory(e.target.value)} style={{...inputS,height:46}} onFocus={focusIn as any} onBlur={focusOut as any}>
                  {FIXED_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Unidade</label>
                <select value={editUnit} onChange={e=>setEditUnit(e.target.value)} style={{...inputS,height:46}} onFocus={focusIn as any} onBlur={focusOut as any}>
                  <option value="">Sem unidade</option>
                  {UNITS.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Data</label>
                <input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} style={inputS} onFocus={focusIn} onBlur={focusOut} />
              </div>
            </div>
            <button onClick={() => {
              const digits = editValue.replace(/[^\d]/g, '');
              const val = parseInt(digits, 10) / 100 || 0;
              p.editFixed(editingItem.id, { name: editName.trim(), value: val, category: editCategory, unit: editUnit || undefined, date: editDate || undefined });
              setEditingItem(null);
            }} style={{marginTop:16,width:'100%',padding:'12px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#f59e0b,#fbbf24)',color:'#fff',fontWeight:800,fontSize:'0.9rem',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 12px rgba(245,158,11,0.3)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              <span className="material-symbols-outlined" style={{fontSize:18}}>save</span>Salvar Alterações
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
