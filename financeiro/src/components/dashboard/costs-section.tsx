'use client';
import { useState, useEffect } from 'react';
import { LogEntry, fmt, UNITS, COST_CATEGORIES, cardS, inputS, labelS, btnPrimary, formatCurrency } from '@/hooks/useDashboard';

interface Props {
  costName:string; setCostName:(v:string)=>void;
  costValue:string; setCostValue:(v:string)=>void;
  costDate:string; setCostDate:(v:string)=>void;
  costCategory:string; setCostCategory:(v:string)=>void;
  costUnit:string; setCostUnit:(v:string)=>void;
  costObs:string; setCostObs:(v:string)=>void;
  addCost:()=>void;
  items:LogEntry[];
  deleteLogByDate:(date:string,name:string,type:string)=>void;
  updateLog:(oldItem:LogEntry,updated:Partial<LogEntry>)=>void;
  selectedUnit?: string;
}

/* Category icon + color map */
const CAT_META: Record<string,{icon:string;color:string}> = {
  'Aluguel':      {icon:'home',          color:'#8b5cf6'},
  'Salários':     {icon:'badge',         color:'#3b82f6'},
  'Internet/Luz': {icon:'electrical_services', color:'#f59e0b'},
  'Impostos':     {icon:'account_balance',color:'#ef4444'},
  'Fornecedores': {icon:'local_shipping', color:'#14b8a6'},
  'Marketing':    {icon:'campaign',      color:'#ec4899'},
  'Outros':       {icon:'more_horiz',    color:'#6b7280'},
};
const getCat = (cat?:string) => CAT_META[cat||''] || {icon:'receipt',color:'var(--text-muted)'};

/* Focus helpers */
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

export function CostsSection({ costName, setCostName, costValue, setCostValue, costDate, setCostDate, costCategory, setCostCategory, costUnit, setCostUnit, costObs, setCostObs, addCost, items, deleteLogByDate, updateLog, selectedUnit }:Props) {
  const costs = items.filter(l=>l.type==='cost').reverse();
  const [success, setSuccess] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number|null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  // Sync costUnit with selected unit from parent
  useEffect(() => {
    if (selectedUnit && selectedUnit !== 'all') {
      setCostUnit(selectedUnit);
    }
  }, [selectedUnit, setCostUnit]);

  const handleAdd = () => {
    addCost();
    // If recurring, also add as a fixed expense
    if (isRecurring && costName.trim() && costValue.trim()) {
      const STORAGE_KEY_FIXED = 'virtuosa_finance_fixed_v2';
      const raw = localStorage.getItem(STORAGE_KEY_FIXED);
      const existing = raw ? JSON.parse(raw) : [];
      const parsedValue = parseFloat(costValue.replace(/\./g,'').replace(',','.')) || 0;
      if (parsedValue > 0) {
        const newFixed = { id: Date.now(), name: costName.trim(), value: parsedValue, category: costCategory };
        localStorage.setItem(STORAGE_KEY_FIXED, JSON.stringify([...existing, newFixed]));
      }
      setIsRecurring(false);
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  const isValid = costName.trim() && costValue.trim() && costDate;

  /* Mini KPI calculations */
  const totalCostsValue = costs.reduce((s, l) => s + l.value, 0);
  const totalCostsCount = costs.length;
  const avgCost = totalCostsCount > 0 ? totalCostsValue / totalCostsCount : 0;
  const uniqueCategories = new Set(costs.map(l => l.category).filter(Boolean)).size;

  /* Top category */
  const catTotals: Record<string,number> = {};
  costs.forEach(c => { if(c.category) catTotals[c.category] = (catTotals[c.category]||0) + c.value; });
  const topCat = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];

  /* Edit helpers */
  const startEdit = (item: LogEntry, idx: number) => {
    setEditingIdx(idx);
    setEditName(item.name);
    setEditValue(String(item.value));
    setEditUnit(item.unit || 'Barueri');
  };
  const saveEdit = (originalItem: LogEntry) => {
    const newValue = parseFloat(editValue.replace(/\./g,'').replace(',','.')) || originalItem.value;
    updateLog(originalItem, { name: editName.trim() || originalItem.name, value: newValue, unit: editUnit });
    setEditingIdx(null);
  };

  const btnSmall = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' } as const;

  return (
    <div>
      {/* Mini KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
        {[
          {label:'Total Despesas',value:fmt(totalCostsValue),icon:'trending_down',color:'#ef4444'},
          {label:'Qtd Lançamentos',value:String(totalCostsCount),icon:'receipt_long',color:'#6366f1'},
          {label:'Despesa Média',value:fmt(avgCost),icon:'calculate',color:'#f59e0b'},
          {label:topCat ? topCat[0] : 'Categorias',value:topCat ? fmt(topCat[1]) : String(uniqueCategories),icon:topCat ? getCat(topCat[0]).icon : 'category',color:topCat ? getCat(topCat[0]).color : '#14b8a6'},
        ].map((kpi,i) => (
          <div key={i} style={{...cardS,padding:14,position:'relative',overflow:'hidden',transition:'all 0.2s'}}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform='translateY(0)'}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${kpi.color},${kpi.color}66)`}} />
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <span style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>{kpi.label}</span>
              <div style={{width:30,height:30,borderRadius:10,background:`${kpi.color}12`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span className="material-symbols-outlined" style={{fontSize:16,color:kpi.color}}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{fontSize:'1.25rem',fontWeight:900,color:kpi.color,lineHeight:1.1}}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Collapsible Form Card */}
      <div style={{...cardS, position:'relative', overflow:'hidden'}}>
        {/* Success overlay */}
        {success && (
          <div style={{
            position:'absolute', inset:0, background:'rgba(16,185,129,0.08)',
            display:'flex', alignItems:'center', justifyContent:'center', zIndex:10,
            animation:'fadeIn 0.3s ease',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span className="material-symbols-outlined" style={{ fontSize:32, color:'#10b981' }}>check_circle</span>
              <span style={{ fontSize:'1.1rem', fontWeight:800, color:'#10b981' }}>Despesa registrada!</span>
            </div>
          </div>
        )}

        {/* Header (clickable to collapse) */}
        <div onClick={() => setFormCollapsed(!formCollapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',userSelect:'none'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{
              width:42, height:42, borderRadius:14,
              background:'linear-gradient(135deg,#ef4444,#f97316)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 4px 12px rgba(239,68,68,0.3)',
            }}>
              <span className="material-symbols-outlined" style={{fontSize:20,color:'#fff'}}>shopping_cart</span>
            </div>
            <div>
              <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:800}}>Registrar Despesa</h2>
              <p style={{margin:0,fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:600}}>{formCollapsed ? 'Clique para expandir' : 'Preencha os dados abaixo'}</p>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--text-muted)',transition:'transform 0.3s',transform:formCollapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
        </div>

        {/* Form body (collapsible) */}
        <div style={{maxHeight:formCollapsed?0:600,opacity:formCollapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:formCollapsed?0:24}}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>event</span>Data</label>
              <input type="date" value={costDate} onChange={e=>setCostDate(e.target.value)} style={inputS} onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>category</span>Categoria</label>
              <select value={costCategory} onChange={e=>setCostCategory(e.target.value)} style={{...inputS,height:46,appearance:'auto'}} onFocus={focusIn} onBlur={focusOut}>
                {COST_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>description</span>Descrição</label>
              <input value={costName} onChange={e=>setCostName(e.target.value)} placeholder="Ex: Conta de Luz" style={inputS} onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>payments</span>Valor (R$)</label>
              <input value={costValue} onChange={e=>setCostValue(formatCurrency(e.target.value))} placeholder="0,00" style={inputS} inputMode="numeric" onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>location_on</span>Centro de Custo</label>
              <select value={costUnit} onChange={e=>setCostUnit(e.target.value)} style={{...inputS,height:46,appearance:'auto'}} onFocus={focusIn} onBlur={focusOut}>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>notes</span>Observações</label>
              <input value={costObs} onChange={e=>setCostObs(e.target.value)} placeholder="Notas opcionais..." style={inputS} onFocus={focusIn} onBlur={focusOut} />
            </div>
          </div>

          {/* Recurring toggle */}
          <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:12,background:isRecurring?'rgba(16,185,129,0.05)':'rgba(0,0,0,0.01)',border:`1px solid ${isRecurring?'rgba(16,185,129,0.2)':'var(--border)'}`,transition:'all 0.3s',cursor:'pointer'}} onClick={()=>setIsRecurring(!isRecurring)}>
            <div style={{width:40,height:22,borderRadius:11,background:isRecurring?'#10b981':'var(--border)',position:'relative',transition:'background 0.3s',flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:isRecurring?20:2,transition:'left 0.3s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}} />
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:'0.82rem',color:isRecurring?'#10b981':'var(--text-muted)'}}>
                <span className="material-symbols-outlined" style={{fontSize:14,verticalAlign:'middle',marginRight:4}}>repeat</span>
                Despesa Recorrente
              </div>
              {isRecurring && <div style={{fontSize:'0.7rem',color:'#10b981',marginTop:2}}>Esta despesa será salva também como Custo Fixo mensal</div>}
            </div>
          </div>

          <button onClick={handleAdd} disabled={!isValid}
            onMouseEnter={e=>{if(isValid){(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 25px rgba(239,68,68,0.35)';}}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 15px rgba(239,68,68,0.25)';}}
            style={{
              ...btnPrimary, marginTop:14, maxWidth:320,
              background: isValid ? 'linear-gradient(135deg,#ef4444,#f97316)' : '#666',
              opacity: isValid ? 1 : 0.5,
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}>
            <span className="material-symbols-outlined">remove_circle</span>
            {isRecurring ? 'Registrar Despesa + Custo Fixo' : 'Registrar Despesa'}
          </button>
        </div>
      </div>

      {/* Expenses List */}
      <div style={{...cardS,marginTop:16}}>
        <div onClick={() => setListCollapsed(!listCollapsed)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', userSelect:'none' }}>
          <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:800, display:'flex', alignItems:'center', gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#ef4444',fontSize:20}}>receipt_long</span>
            Lista de Despesas ({costs.length})
          </h2>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {costs.length > 0 && (
              <span style={{ fontSize:'0.75rem', fontWeight:700, padding:'4px 12px', borderRadius:8, background:'rgba(239,68,68,0.08)', color:'#ef4444' }}>
                Total: {fmt(totalCostsValue)}
              </span>
            )}
            <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--text-muted)',transition:'transform 0.3s',transform:listCollapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
          </div>
        </div>
        <div style={{maxHeight:listCollapsed?0:5000,opacity:listCollapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:listCollapsed?0:12}}>
        <ul style={{listStyle:'none',padding:0,margin:0}}>
          {costs.length===0?(
            <div style={{ textAlign:'center', padding:'32px 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:40, color:'var(--border)', marginBottom:8, display:'block' }}>receipt_long</span>
              <p style={{color:'var(--text-muted)',fontSize:'0.88rem',fontWeight:600}}>Nenhuma despesa neste mês.</p>
            </div>
          ):costs.map((item,i)=>{
            const cat = getCat(item.category);
            return (
            <li key={i} style={{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'12px 14px',borderRadius:12,marginBottom:4,
              background: i%2===0 ? 'transparent' : 'rgba(0,0,0,0.015)',
              transition:'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.02)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i%2===0 ? 'transparent' : 'rgba(0,0,0,0.015)'}
            >
              {editingIdx === i ? (
                /* Edit mode */
                <>
                  <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputS, flex: 1, minWidth: 120, padding: '6px 10px', fontSize: '0.82rem' }} />
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} style={{ ...inputS, width: 100, padding: '6px 10px', fontSize: '0.82rem' }} placeholder="Valor" />
                    <select value={editUnit} onChange={e => setEditUnit(e.target.value)} style={{ ...inputS, width: 90, padding: '6px 10px', fontSize: '0.82rem' }}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => saveEdit(item)} style={{ ...btnSmall, background: '#10b981', borderRadius: 6, padding: '4px 8px' }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>check</span></button>
                    <button onClick={() => setEditingIdx(null)} style={{ ...btnSmall }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>close</span></button>
                  </div>
                </>
              ) : (
                /* View mode */
                <>
                  <div style={{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0}}>
                    <div style={{width:34,height:34,borderRadius:10,background:`${cat.color}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span className="material-symbols-outlined" style={{fontSize:16,color:cat.color}}>{cat.icon}</span>
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:'0.88rem',color:'var(--text-main)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                      <div style={{fontSize:'0.72rem',color:'var(--text-muted)',display:'flex',gap:6,marginTop:2,flexWrap:'wrap'}}>
                        <span>{item.date?new Date(item.date).toLocaleDateString('pt-BR'):''}</span>
                        {item.category&&<span style={{background:`${cat.color}10`,color:cat.color,padding:'1px 8px',borderRadius:6,fontSize:'0.68rem',fontWeight:600}}>{item.category}</span>}
                        {item.unit&&<span style={{background:'rgba(99,102,241,0.06)',padding:'1px 8px',borderRadius:6,fontSize:'0.68rem',fontWeight:600}}>{item.unit}</span>}
                        {item.obs&&<span style={{color:'var(--text-muted)',fontSize:'0.68rem',fontStyle:'italic'}} title={item.obs}>💬 {item.obs.length > 20 ? item.obs.slice(0,20)+'…' : item.obs}</span>}
                      </div>
                    </div>
                  </div>
                  <strong style={{color:'#ef4444',fontWeight:800,fontSize:'0.95rem',flexShrink:0,marginLeft:8}}>-{fmt(item.value)}</strong>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 4 }}>
                    <button onClick={() => startEdit(item, i)} title="Editar" style={{...btnSmall}}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>edit</span></button>
                    <button onClick={() => { if(item.date && item.name) deleteLogByDate(item.date, item.name, 'cost'); }} title="Excluir" style={{...btnSmall}}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span></button>
                  </div>
                </>
              )}
            </li>
          );})}
        </ul>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }`}</style>
    </div>
  );
}
