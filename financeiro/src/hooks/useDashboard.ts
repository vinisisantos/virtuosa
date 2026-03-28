'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/components/toast';

/* ─── Constants ─── */
export const STORAGE_KEY_LOGS = 'virtuosa_finance_logs_v2';
export const STORAGE_KEY_GOALS = 'virtuosa_goals_v3';
export const STORAGE_KEY_FIXED = 'virtuosa_fixed_expenses_v2';
export const STORAGE_KEY_BILLS = 'virtuosa_bills_v2';
export const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const UNITS = ['Barueri','Osasco','SBC','SCS'];
export const COST_CATEGORIES = ['Salários','Produtos','Marketing','Aluguel','Equipamentos','Impostos','Serviços','Outros'];
export const FIXED_CATEGORIES = ['Aluguel','Salários','Produtos','Internet','Luz','Marketing','Segurança','Sistema','Contabilidade','Royalties','Água','Parcela','Outros'];
export const BILL_CATEGORIES = ['Aluguel','Salários','Internet','Luz','Impostos','Fornecedores','Marketing','Outros'];

/* ─── Types ─── */
export interface LogEntry { type:'sale'|'cost'; name:string; value:number; unit?:string; payment?:string; category?:string; obs?:string; date:string; id?:string; seller?:string; }
export interface FixedExpense { id:number; name:string; value:number; category:string; date?:string; unit?:string; }
export interface Bill { id:number; name:string; value:number; dueDay:number|null; dueDateManual:string|null; type:'fixo'|'variavel'; category:string; payments:Record<string,boolean>; }
export interface DueBill extends Bill { dueDate:Date; diffDays:number; isOverdue:boolean; }
export type Tab = 'dashboard'|'sales'|'expenses'|'fixed-costs'|'goals'|'reports'|'analytics'|'commissions'|'units'|'activity'|'backup'|'retention';

/* ─── Formatters ─── */
export const fmt = (v:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
export const parseCur = (s:string) => { const d=s.replace(/[^\d]/g,''); return parseFloat(d)/100||0; };
export const formatCurrency = (raw: string): string => {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  const val = parseInt(digits, 10) / 100;
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* ─── Styles (shared) ─── */
export const cardS:React.CSSProperties = { background:'var(--card-bg)', backdropFilter:'blur(20px)', borderRadius:20, border:'1px solid var(--border)', boxShadow:'var(--shadow-md)', padding:24, transition:'box-shadow 0.3s ease, transform 0.3s ease' };
export const inputS:React.CSSProperties = { width:'100%', padding:'12px 16px', borderRadius:12, border:'2px solid var(--border)', outline:'none', fontSize:'0.88rem', background:'var(--bg)', boxSizing:'border-box' as const, color:'var(--text-main)', fontFamily:'inherit', fontWeight:600, transition:'border-color 0.2s, box-shadow 0.2s, transform 0.15s' };
export const labelS:React.CSSProperties = { display:'flex', alignItems:'center', gap:5, fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', marginBottom:6, letterSpacing:'0.5px', textTransform:'uppercase' as const };
export const btnPrimary:React.CSSProperties = { width:'100%', padding:'13px', borderRadius:12, border:'none', background:'linear-gradient(135deg, var(--primary), #ff4db1)', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 15px rgba(230,0,126,0.25)', transition:'all 0.2s ease' };
export const formGroupS:React.CSSProperties = { display:'flex', flexDirection:'column' as const };
export const formHeaderS:React.CSSProperties = { display:'flex', alignItems:'center', gap:12, marginBottom:24 };

/* ─── Hook ─── */
export function useDashboard() {
  const now = new Date();
  
  // Read initial tab from URL query param (e.g., ?tab=sales)
  const getTabFromUrl = (): Tab => {
    if (typeof window === 'undefined') return 'dashboard';
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    const validTabs: Tab[] = ['dashboard', 'sales', 'expenses', 'fixed-costs', 'goals', 'reports', 'analytics', 'commissions', 'units', 'activity', 'backup', 'retention'];
    return validTabs.includes(urlTab as Tab) ? (urlTab as Tab) : 'dashboard';
  };
  
  const [activeTab, setActiveTabState] = useState<Tab>(getTabFromUrl);
  
  // Wrap setActiveTab to also update URL
  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === 'dashboard') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [goals, setGoals] = useState<Record<string, Record<string, number>>>({});
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showPopup, setShowPopup] = useState(true);
  const [showMiniBell, setShowMiniBell] = useState(false);
  const [isDashboardAdmin, setIsDashboardAdmin] = useState(false);

  // Sale form
  const [saleName,setSaleName]=useState(''); const [saleValue,setSaleValue]=useState(''); const [saleDate,setSaleDate]=useState('');
  const [salePayment,setSalePayment]=useState('Pix'); const [saleUnit,setSaleUnit]=useState('Barueri'); const [saleObs,setSaleObs]=useState(''); const [saleSeller,setSaleSeller]=useState('');
  // Cost form
  const [costName,setCostName]=useState(''); const [costValue,setCostValue]=useState(''); const [costDate,setCostDate]=useState('');
  const [costCategory,setCostCategory]=useState('Salários'); const [costUnit,setCostUnit]=useState('Barueri'); const [costObs,setCostObs]=useState('');
  // Fixed form
  const [fixedName,setFixedName]=useState(''); const [fixedValue,setFixedValue]=useState(''); const [fixedCategory,setFixedCategory]=useState('Aluguel'); const [fixedDate,setFixedDate]=useState(''); const [fixedUnit,setFixedUnit]=useState('Barueri');
  // Goal
  const [goalInput,setGoalInput]=useState('');
  const [goalUnits,setGoalUnits]=useState<string[]>([...UNITS]);
  // Bill form
  const [billName,setBillName]=useState(''); const [billValue,setBillValue]=useState(''); const [billType,setBillType]=useState<'fixo'|'variavel'>('fixo');
  const [billDueDay,setBillDueDay]=useState(''); const [billDueDate,setBillDueDate]=useState(''); const [billCategory,setBillCategory]=useState('Aluguel');

  const barRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<any[]>([]);

  // Admin check
  useEffect(() => {
    try {
      const raw = localStorage.getItem('virtuosa_user');
      if (raw) {
        const user = JSON.parse(raw);
        const perms = user.permissions || {};
        const isAdm = perms.admin === true || user.role === 'ADMINISTRADOR';
        setIsDashboardAdmin(isAdm);
        if (!isAdm && user.unit) setSelectedUnit(user.unit);
      }
    } catch {}
  }, []);

  // Load data (localStorage first, then try server backup if empty)
  useEffect(() => {
    const loadData = async () => {
      const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
      let loadedLogs:LogEntry[] = savedLogs ? JSON.parse(savedLogs) : [];
      const sg = localStorage.getItem(STORAGE_KEY_GOALS);
      const sf = localStorage.getItem(STORAGE_KEY_FIXED);
      const sb = localStorage.getItem(STORAGE_KEY_BILLS);

      // If localStorage is empty, try to restore from server backup
      const hasLocalData = savedLogs || sg || sf || sb;
      if (!hasLocalData) {
        try {
          const backupRes = await fetch('/api/backup');
          if (backupRes.ok) {
            const backup = await backupRes.json();
            if (backup.exists) {
              loadedLogs = backup.logs || [];
              localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(loadedLogs));
              if (backup.goals) { setGoals(backup.goals); localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(backup.goals)); }
              if (backup.fixed) { setFixedExpenses(backup.fixed); localStorage.setItem(STORAGE_KEY_FIXED, JSON.stringify(backup.fixed)); }
              if (backup.bills) { setBills(backup.bills); localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(backup.bills)); }
              console.log('[Backup] Dados restaurados do servidor:', backup.updatedAt);
            }
          }
        } catch (e) { console.warn('[Backup] Falha ao restaurar do servidor:', e); }
      }

      try {
        const res = await fetch('/api/payroll/dashboard-sync');
        if (res.ok) { const data = await res.json(); if (data.success&&data.data) { loadedLogs = loadedLogs.filter(l=>!l.id||!l.id.toString().startsWith('payroll-')); loadedLogs = [...loadedLogs,...data.data]; } }
      } catch {}
      setLogs(loadedLogs);
      if(sg) setGoals(JSON.parse(sg));
      // Migrate from v2 (single number per month) to v3 (per-unit)
      const sgOld = localStorage.getItem('virtuosa_goals_v2');
      if(sgOld && !sg) {
        try {
          const old:Record<string,number> = JSON.parse(sgOld);
          const migrated:Record<string,Record<string,number>> = {};
          Object.entries(old).forEach(([key,val]) => { migrated[key] = {}; UNITS.forEach(u => { migrated[key][u] = val / UNITS.length; }); });
          setGoals(migrated); localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(migrated));
        } catch {}
      }
      if(sf) setFixedExpenses(JSON.parse(sf));
      if(sb) setBills(JSON.parse(sb));
    };
    loadData();
  }, []);

  // Auto-sync to server (debounced — waits 5s after last change)
  const syncTimerRef = useRef<NodeJS.Timeout|null>(null);
  useEffect(() => {
    if (!logs.length && !Object.keys(goals).length && !fixedExpenses.length && !bills.length) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const payload = {
        logs: logs.filter(l => !l.id || !l.id.toString().startsWith('payroll-')),
        goals,
        fixed: fixedExpenses,
        bills,
        isAuto: true,
      };
      fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(r => r.json())
        .then(d => { if (d.success) console.log('[Backup] Auto-sync OK:', d.updatedAt); })
        .catch(e => console.warn('[Backup] Auto-sync falhou:', e));
    }, 5000);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [logs, goals, fixedExpenses, bills]);

  // Filtered logs
  const filteredLogs = logs.filter(item => {
    if(!item.date) return false;
    const d = new Date(item.date);
    return d.getUTCMonth()===selectedMonth && d.getUTCFullYear()===selectedYear && (selectedUnit==='all'||(item.unit||'')===selectedUnit);
  });

  // Calculations
  let totalRev=0, totalCost=0;
  const procStats:Record<string,number>={};
  filteredLogs.forEach(item => {
    if(item.type==='sale'){ totalRev+=item.value; const n=item.name||'Outros'; procStats[n]=(procStats[n]||0)+item.value; }
    else totalCost+=item.value;
  });
  const totalFixed = fixedExpenses.reduce((s,i)=>s+i.value,0);
  totalCost += totalFixed;
  const balance = totalRev - totalCost;
  const margin = totalRev>0?(balance/totalRev)*100:0;
  const goalKey = `${selectedYear}-${selectedMonth}`;
  const goalMap = goals[goalKey] || {};
  const currentGoal = selectedUnit === 'all'
    ? Object.values(goalMap).reduce((s,v) => s+v, 0)
    : (goalMap[selectedUnit] || 0);
  const goalPerc = currentGoal>0?Math.min((totalRev/currentGoal)*100,100):0;
  const sortedProcs = Object.entries(procStats).sort((a,b)=>b[1]-a[1]);

  // Parse procedures from sale entries (obs field has "10x ProcName, 5x ProcName | ...")
  const parseProcedures = (item: LogEntry): { name: string; qty: number; value: number }[] => {
    const obs = item.obs || '';
    const procPart = obs.split('|')[0]?.trim();
    if (!procPart) {
      // Manual entry — use sale name as procedure name
      return [{ name: item.name || 'Outros', qty: 1, value: item.value }];
    }
    const procs: { name: string; qty: number; value: number }[] = [];
    const parts = procPart.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^(\d+)x\s+(.+)$/i);
      if (match) {
        procs.push({ name: match[2].trim(), qty: parseInt(match[1]), value: 0 });
      } else if (part.length > 0) {
        procs.push({ name: part, qty: 1, value: 0 });
      }
    }
    // If we got procedures, distribute value proportionally (or use 0 if we don't know individual prices)
    if (procs.length === 0) return [{ name: item.name || 'Outros', qty: 1, value: item.value }];
    // If only 1 proc, it gets all the value
    if (procs.length === 1) { procs[0].value = item.value; return procs; }
    // Multiple procs — each gets proportional value based on qty
    const totalQty = procs.reduce((s, p) => s + p.qty, 0);
    procs.forEach(p => { p.value = totalQty > 0 ? (p.qty / totalQty) * item.value : 0; });
    return procs;
  };

  // Procedure ranking (count + revenue, all units and per unit)
  const procRankMap: Record<string, { count: number; revenue: number }> = {};
  const procAllUnitsMap: Record<string, Record<string, { count: number; revenue: number }>> = {};
  UNITS.forEach(u => { procAllUnitsMap[u] = {}; });

  // Process filtered logs (current unit selection)
  filteredLogs.filter(l => l.type === 'sale').forEach(item => {
    const procs = parseProcedures(item);
    for (const proc of procs) {
      if (!procRankMap[proc.name]) procRankMap[proc.name] = { count: 0, revenue: 0 };
      procRankMap[proc.name].count += proc.qty;
      procRankMap[proc.name].revenue += proc.value;
    }
  });

  // Process all units (for per-unit breakdown)
  logs.filter(item => {
    if (!item.date) return false;
    const d = new Date(item.date);
    return d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear && item.type === 'sale';
  }).forEach(item => {
    const unit = item.unit || '';
    if (!unit || !procAllUnitsMap[unit]) return;
    const procs = parseProcedures(item);
    for (const proc of procs) {
      if (!procAllUnitsMap[unit][proc.name]) procAllUnitsMap[unit][proc.name] = { count: 0, revenue: 0 };
      procAllUnitsMap[unit][proc.name].count += proc.qty;
      procAllUnitsMap[unit][proc.name].revenue += proc.value;
    }
  });
  
  const procRanking = Object.entries(procRankMap)
    .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
    .sort((a, b) => b.revenue - a.revenue);
  
  const procByUnit: Record<string, { name: string; count: number; revenue: number }[]> = {};
  UNITS.forEach(u => {
    procByUnit[u] = Object.entries(procAllUnitsMap[u])
      .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  });

  // Top clients ranking (using sale name = client name for imported entries)
  const clientMap: Record<string, { count: number; totalSpent: number; lastDate: string }> = {};
  filteredLogs.filter(l => l.type === 'sale').forEach(item => {
    const name = item.name || 'Outros';
    if (!clientMap[name]) clientMap[name] = { count: 0, totalSpent: 0, lastDate: '' };
    clientMap[name].count++;
    clientMap[name].totalSpent += item.value;
    if (item.date && item.date > clientMap[name].lastDate) clientMap[name].lastDate = item.date;
  });
  const topClients = Object.entries(clientMap)
    .map(([name, data]) => ({ name, count: data.count, totalSpent: data.totalSpent, lastDate: data.lastDate }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // Extra KPIs
  const salesCount = filteredLogs.filter(l=>l.type==='sale').length;
  const ticketMedio = salesCount>0?totalRev/salesCount:0;

  // Client retention
  const currentMonthClients = new Set<string>();
  const previousMonthsClients = new Set<string>();
  logs.filter(item => {
    if (!item.date || item.type !== 'sale') return false;
    const d = new Date(item.date);
    return d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear && (selectedUnit === 'all' || (item.unit || '') === selectedUnit);
  }).forEach(item => currentMonthClients.add(item.name));
  
  logs.filter(item => {
    if (!item.date || item.type !== 'sale') return false;
    const d = new Date(item.date);
    const isCurrentMonth = d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear;
    return !isCurrentMonth && (selectedUnit === 'all' || (item.unit || '') === selectedUnit);
  }).forEach(item => previousMonthsClients.add(item.name));
  
  const returningClients = [...currentMonthClients].filter(c => previousMonthsClients.has(c));
  const newClients = [...currentMonthClients].filter(c => !previousMonthsClients.has(c));
  const clientRetention = {
    total: currentMonthClients.size,
    returning: returningClients.length,
    new: newClients.length,
    rate: currentMonthClients.size > 0 ? (returningClients.length / currentMonthClients.size) * 100 : 0,
  };

  // Previous month comparison
  const prevMonth = selectedMonth===0?11:selectedMonth-1;
  const prevYear = selectedMonth===0?selectedYear-1:selectedYear;
  let prevRev=0;
  logs.filter(item=>{if(!item.date)return false;const d=new Date(item.date);return d.getUTCMonth()===prevMonth&&d.getUTCFullYear()===prevYear&&(selectedUnit==='all'||(item.unit||'')===selectedUnit);})
    .forEach(item=>{if(item.type==='sale')prevRev+=item.value;});
  const revVariation = prevRev>0?((totalRev-prevRev)/prevRev)*100:0;

  // Monthly evolution (last 6 months)
  const monthlyEvolution:{month:string;rev:number;cost:number}[] = [];
  for(let i=5;i>=0;i--){
    let m=selectedMonth-i, y=selectedYear;
    while(m<0){m+=12;y--;}
    let mRev=0,mCost=0;
    logs.filter(item=>{if(!item.date)return false;const d=new Date(item.date);return d.getUTCMonth()===m&&d.getUTCFullYear()===y&&(selectedUnit==='all'||(item.unit||'')===selectedUnit);})
      .forEach(item=>{if(item.type==='sale')mRev+=item.value;else mCost+=item.value;});
    mCost+=totalFixed;
    monthlyEvolution.push({month:MONTHS[m].substring(0,3),rev:mRev,cost:mCost});
  }

  // Revenue per unit
  const revenueByUnit:Record<string,number>={};
  UNITS.forEach(u=>{revenueByUnit[u]=0;});
  logs.filter(item=>{if(!item.date)return false;const d=new Date(item.date);return d.getUTCMonth()===selectedMonth&&d.getUTCFullYear()===selectedYear;})
    .forEach(item=>{if(item.type==='sale'&&item.unit)revenueByUnit[item.unit]=(revenueByUnit[item.unit]||0)+item.value;});

  // Full unit comparison data
  const unitComparison = UNITS.map(u => {
    let rev = 0, cost = 0, sales = 0, prevRevU = 0;
    logs.filter(item => {
      if (!item.date) return false;
      const d = new Date(item.date);
      return d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear && (item.unit || '') === u;
    }).forEach(item => {
      if (item.type === 'sale') { rev += item.value; sales++; }
      else { cost += item.value; }
    });
    // Previous month for variation
    logs.filter(item => {
      if (!item.date) return false;
      const d = new Date(item.date);
      return d.getUTCMonth() === prevMonth && d.getUTCFullYear() === prevYear && (item.unit || '') === u;
    }).forEach(item => { if (item.type === 'sale') prevRevU += item.value; });
    const ticket = sales > 0 ? rev / sales : 0;
    const margin = rev > 0 ? ((rev - cost) / rev) * 100 : 0;
    const variation = prevRevU > 0 ? ((rev - prevRevU) / prevRevU) * 100 : 0;
    return { unit: u, revenue: rev, cost, salesCount: sales, ticket, margin, variation, balance: rev - cost };
  });

  // Cost breakdown by category
  const costByCategory:Record<string,number>={};
  filteredLogs.filter(l=>l.type==='cost').forEach(l=>{const c=l.category||'Outros';costByCategory[c]=(costByCategory[c]||0)+l.value;});
  fixedExpenses.forEach(f=>{costByCategory[f.category]=(costByCategory[f.category]||0)+f.value;});
  const sortedCostCats = Object.entries(costByCategory).sort((a,b)=>b[1]-a[1]);

  // Save helpers
  const saveLogs = (newLogs:LogEntry[]) => { setLogs(newLogs); localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(newLogs.filter(l=>!l.id||!l.id.toString().startsWith('payroll-')))); };
  const saveFixed = (f:FixedExpense[]) => { setFixedExpenses(f); localStorage.setItem(STORAGE_KEY_FIXED, JSON.stringify(f)); };
  const saveBillsState = (b:Bill[]) => { setBills(b); localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(b)); };

  // Actions
  const addSale = () => {
    const value = parseCur(saleValue);
    if(!saleName.trim()||value<=0) return toast('Informe o procedimento e valor.', 'warning');
    let itemDate:Date;
    if(saleDate) itemDate=new Date(saleDate+'T12:00:00Z');
    else { itemDate=new Date(); if(selectedMonth!==now.getMonth()||selectedYear!==now.getFullYear()) itemDate=new Date(Date.UTC(selectedYear,selectedMonth,1,12)); }
    saveLogs([...logs,{type:'sale',name:saleName.trim(),value,unit:saleUnit,payment:salePayment,obs:saleObs,date:itemDate.toISOString(),seller:saleSeller}]);
    setSaleName(''); setSaleValue(''); setSaleObs(''); setSaleSeller('');
  };

  const deleteSale = (index: number) => {
    const salesInOrder = logs.map((l, i) => ({ ...l, _idx: i }));
    const target = salesInOrder[index];
    if (!target) return;
    const newLogs = logs.filter((_, i) => i !== target._idx);
    saveLogs(newLogs);
    toast('Lançamento excluído.', 'success');
  };

  const deleteLogByDate = (date: string, name: string, type: string) => {
    const newLogs = logs.filter(l => !(l.date === date && l.name === name && l.type === type));
    saveLogs(newLogs);
    toast('Lançamento excluído.', 'success');
  };

  const updateLog = (oldItem: LogEntry, updatedFields: Partial<LogEntry>) => {
    const newLogs = logs.map(l => {
      if (l.date === oldItem.date && l.name === oldItem.name && l.type === oldItem.type && l.value === oldItem.value) {
        return { ...l, ...updatedFields };
      }
      return l;
    });
    saveLogs(newLogs);
    toast('Lançamento atualizado.', 'success');
  };

  const clearSalesByUnit = (unit: string) => {
    const newLogs = logs.filter(l => {
      if (l.type !== 'sale' || l.unit !== unit) return true;
      const d = new Date(l.date);
      return !(d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear);
    });
    saveLogs(newLogs);
    toast(`Vendas de ${unit} (${MONTHS[selectedMonth]}/${selectedYear}) removidas.`, 'success');
  };

  const clearAllSales = () => {
    const newLogs = logs.filter(l => {
      if (l.type !== 'sale') return true;
      const d = new Date(l.date);
      return !(d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear);
    });
    saveLogs(newLogs);
    toast(`Todas as vendas de ${MONTHS[selectedMonth]}/${selectedYear} removidas.`, 'success');
  };

  const clearSalesByUnitAllMonths = (unit: string) => {
    const newLogs = logs.filter(l => !(l.type === 'sale' && l.unit === unit));
    saveLogs(newLogs);
    toast(`Todas as vendas de ${unit} (todos os meses) removidas.`, 'success');
  };

  const clearAllSalesAllMonths = () => {
    const newLogs = logs.filter(l => l.type !== 'sale');
    saveLogs(newLogs);
    toast('Todas as vendas de todos os meses removidas.', 'success');
  };

  const addCost = () => {
    const value = parseCur(costValue);
    if(!costName.trim()||value<=0) return toast('Informe a descrição e valor.', 'warning');
    let itemDate:Date;
    if(costDate) itemDate=new Date(costDate+'T12:00:00Z');
    else { itemDate=new Date(); if(selectedMonth!==now.getMonth()||selectedYear!==now.getFullYear()) itemDate=new Date(Date.UTC(selectedYear,selectedMonth,1,12)); }
    saveLogs([...logs,{type:'cost',name:costName.trim(),value,category:costCategory,unit:costUnit,obs:costObs,date:itemDate.toISOString()}]);
    // Auto-switch to the month of the expense so it shows immediately
    const expMonth = itemDate.getUTCMonth();
    const expYear = itemDate.getUTCFullYear();
    if (expMonth !== selectedMonth || expYear !== selectedYear) {
      setSelectedMonth(expMonth);
      setSelectedYear(expYear);
    }
    setCostName(''); setCostValue(''); setCostObs('');
  };

  const addFixed = () => {
    const value = parseCur(fixedValue);
    if(!fixedName.trim()||value<=0) return toast('Informe nome e valor.', 'warning');
    saveFixed([...fixedExpenses,{id:Date.now(),name:fixedName.trim(),value,category:fixedCategory,date:fixedDate||undefined,unit:fixedUnit}]);
    setFixedName(''); setFixedValue(''); setFixedDate('');
  };

  const handleSaveGoal = () => {
    const val = parseCur(goalInput);
    if(val<=0) return toast('Defina uma meta válida.', 'warning');
    if(goalUnits.length===0) return toast('Selecione ao menos uma unidade.', 'warning');
    const existing = goals[goalKey] || {};
    const updated = {...existing};
    goalUnits.forEach(u => { updated[u] = val; });
    const newGoals = {...goals,[goalKey]:updated};
    setGoals(newGoals); localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(newGoals));
    const total = goalUnits.length * val;
    toast(`Meta salva! ${goalUnits.length} unidade(s) × R$ ${fmt(val)} = R$ ${fmt(total)}`, 'success');
  };

  const addBill = () => {
    const value = parseCur(billValue);
    if(!billName.trim()||value<=0) return toast('Informe nome e valor da conta.', 'warning');
    let dueDay:number|null=null, dueDateManual:string|null=null;
    if(billType==='fixo'){ dueDay=parseInt(billDueDay); if(!dueDay||dueDay<1||dueDay>31) return toast('Dia de vencimento inválido.', 'warning'); }
    else { if(!billDueDate) return toast('Informe a data de vencimento.', 'warning'); dueDateManual=billDueDate; }
    saveBillsState([...bills,{id:Date.now(),name:billName.trim(),value,dueDay,dueDateManual,type:billType,category:billCategory,payments:{}}]);
    setBillName(''); setBillValue(''); setBillDueDay(''); setBillDueDate('');
  };

  // Bill helpers
  const getBillDueDate = (bill:Bill) => {
    const today=new Date();
    if(bill.type==='fixo'){ const y=today.getFullYear(),m=today.getMonth(),last=new Date(y,m+1,0).getDate(),d=Math.min(bill.dueDay||1,last); return new Date(y,m,d); }
    return new Date((bill.dueDateManual||'')+'T12:00:00');
  };
  const getPaymentKey = (bill:Bill) => { const d=getBillDueDate(bill); return bill.type==='fixo'?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:bill.dueDateManual||''; };
  const isBillPaid = (bill:Bill) => { const k=getPaymentKey(bill); return bill.payments&&bill.payments[k]===true; };

  // Due bills
  const today = new Date(); today.setHours(0,0,0,0);
  const dueBills:DueBill[] = bills.filter(b=>!isBillPaid(b)).map(b=>{
    const dd=getBillDueDate(b); dd.setHours(0,0,0,0);
    const diff=Math.ceil((dd.getTime()-today.getTime())/(1000*60*60*24));
    return diff<=5?{...b,dueDate:dd,diffDays:diff,isOverdue:diff<0}:null;
  }).filter(Boolean) as DueBill[];
  dueBills.sort((a,b)=>a.diffDays-b.diffDays);

  // Smart Notifications
  const smartAlerts: { type: 'warning' | 'danger' | 'info' | 'success'; message: string; icon: string }[] = [];
  if (revVariation < -10 && prevRev > 0) smartAlerts.push({ type: 'warning', message: `Faturamento caiu ${Math.abs(revVariation).toFixed(1)}% em relação ao mês anterior`, icon: 'trending_down' });
  if (revVariation > 20 && prevRev > 0) smartAlerts.push({ type: 'success', message: `Faturamento cresceu ${revVariation.toFixed(1)}% vs mês anterior! 🚀`, icon: 'trending_up' });
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;
  if (currentGoal > 0 && goalPerc < (monthProgress * 100) * 0.7 && dayOfMonth > 10) smartAlerts.push({ type: 'danger', message: `Meta em risco! ${goalPerc.toFixed(0)}% atingido com ${((1 - monthProgress) * 100).toFixed(0)}% do mês restante`, icon: 'flag' });
  if (balance < 0 && totalRev > 0) smartAlerts.push({ type: 'danger', message: `Margem negativa! Custos (${fmt(totalCost)}) superam faturamento (${fmt(totalRev)})`, icon: 'warning' });
  const overdueBills = dueBills.filter(b => b.isOverdue);
  if (overdueBills.length > 0) { const total = overdueBills.reduce((s, b) => s + b.value, 0); smartAlerts.push({ type: 'danger', message: `${overdueBills.length} conta${overdueBills.length > 1 ? 's' : ''} vencida${overdueBills.length > 1 ? 's' : ''}: ${fmt(total)}`, icon: 'event_busy' }); }
  const bestUnit = unitComparison.length > 0 ? unitComparison.reduce((best, uc) => uc.revenue > best.revenue ? uc : best, unitComparison[0]) : null;
  if (bestUnit && bestUnit.revenue > 0 && unitComparison.filter(u => u.revenue > 0).length > 1) smartAlerts.push({ type: 'info', message: `${bestUnit.unit} lidera com ${fmt(bestUnit.revenue)} (${((bestUnit.revenue / (totalRev || 1)) * 100).toFixed(0)}% do total)`, icon: 'emoji_events' });


  const markPaid = (id:number) => { const newBills=bills.map(b=>{if(b.id!==id)return b;const k=getPaymentKey(b);return{...b,payments:{...b.payments,[k]:true}};}); saveBillsState(newBills); };
  const clearAll = () => { localStorage.clear(); location.reload(); };
  const deleteFixed = (id:number) => saveFixed(fixedExpenses.filter(f=>f.id!==id));
  const editFixed = (id:number, data: Partial<FixedExpense>) => saveFixed(fixedExpenses.map(f => f.id === id ? { ...f, ...data } : f));
  const deleteBill = (id:number) => saveBillsState(bills.filter(x=>x.id!==id));

  return {
    // Core state
    activeTab, setActiveTab, selectedMonth, setSelectedMonth, selectedYear, setSelectedYear,
    selectedUnit, setSelectedUnit, isDashboardAdmin,
    // Data
    logs, filteredLogs, fixedExpenses, bills, dueBills, smartAlerts,
    // Calculations
    totalRev, totalCost, balance, margin, currentGoal, goalPerc, sortedProcs,
    salesCount, ticketMedio, revVariation, monthlyEvolution, revenueByUnit, sortedCostCats,
    procRanking, procByUnit, topClients, unitComparison, clientRetention,
    // Sale form
    saleName, setSaleName, saleValue, setSaleValue, saleDate, setSaleDate,
    salePayment, setSalePayment, saleUnit, setSaleUnit, saleObs, setSaleObs, saleSeller, setSaleSeller, addSale,
    deleteLogByDate, updateLog, clearSalesByUnit, clearAllSales, clearSalesByUnitAllMonths, clearAllSalesAllMonths,
    // Cost form
    costName, setCostName, costValue, setCostValue, costDate, setCostDate,
    costCategory, setCostCategory, costUnit, setCostUnit, costObs, setCostObs, addCost,
    // Fixed form
    fixedName, setFixedName, fixedValue, setFixedValue, fixedCategory, setFixedCategory, fixedDate, setFixedDate, fixedUnit, setFixedUnit, addFixed, deleteFixed, editFixed,
    // Goal
    goalInput, setGoalInput, goalUnits, setGoalUnits, handleSaveGoal,
    // Bill form
    billName, setBillName, billValue, setBillValue, billType, setBillType,
    billDueDay, setBillDueDay, billDueDate, setBillDueDate, billCategory, setBillCategory,
    addBill, deleteBill, markPaid, isBillPaid,
    // UI state
    showClearModal, setShowClearModal, showPopup, setShowPopup, showMiniBell, setShowMiniBell,
    // Chart refs
    barRef, chartInstances,
    // Helpers
    clearAll, now,
  };
}
