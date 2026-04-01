'use client';
import { useState, useMemo } from 'react';
import { FixedCostsSection } from '@/components/dashboard/fixed-costs-section';
import { CostsSection } from '@/components/dashboard/costs-section';
import { cardS, fmt, UNITS } from '@/hooks/useDashboard';

type CustoSubTab = 'fixos' | 'contas' | 'despesas' | 'futuro';

const SUB_TABS: { key: CustoSubTab; label: string; icon: string; color: string }[] = [
  { key: 'fixos',    label: 'Custos Fixos',        icon: 'repeat',         color: '#8b5cf6' },
  { key: 'contas',   label: 'Contas a Pagar',      icon: 'event_upcoming', color: '#3b82f6' },
  { key: 'despesas', label: 'Despesas Variáveis',   icon: 'trending_down',  color: '#ef4444' },
  { key: 'futuro',   label: 'Custos Futuros',       icon: 'schedule',       color: '#f59e0b' },
];

export function CustosUnificado({ d }: { d: any }) {
  const [sub, setSub] = useState<CustoSubTab>('fixos');

  // Future costs projection
  const futureCosts = useMemo(() => {
    const months: { label: string; items: { name: string; value: number; type: string; dueInfo: string; unit?: string }[]; total: number }[] = [];
    const now = new Date();
    for (let m = 1; m <= 3; m++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const futureMonth = futureDate.getMonth();
      const futureYear = futureDate.getFullYear();
      const monthLabel = futureDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const items: { name: string; value: number; type: string; dueInfo: string; unit?: string }[] = [];

      // Fixed expenses repeat every month
      (d.fixedExpenses || []).forEach((f: any) => {
        items.push({ name: f.name, value: f.value, type: 'fixo', dueInfo: 'Recorrente', unit: f.unit || '' });
      });

      // Fixed bills (type=fixo) repeat monthly
      (d.bills || []).filter((b: any) => b.type === 'fixo').forEach((b: any) => {
        items.push({ name: b.name, value: b.value, type: 'conta', dueInfo: `Dia ${b.dueDay}`, unit: '' });
      });

      // Variable bills with future due dates in that month
      (d.bills || []).filter((b: any) => b.type === 'variavel' && b.dueDateManual).forEach((b: any) => {
        const due = new Date(b.dueDateManual + 'T12:00:00');
        if (due.getMonth() === futureMonth && due.getFullYear() === futureYear) {
          items.push({ name: b.name, value: b.value, type: 'conta-var', dueInfo: due.toLocaleDateString('pt-BR'), unit: '' });
        }
      });

      // Despesas variáveis (costs from logs) with dates in this future month
      (d.logs || []).filter((l: any) => l.type === 'cost' && l.date).forEach((l: any) => {
        const dt = new Date(l.date);
        if (dt.getUTCMonth() === futureMonth && dt.getUTCFullYear() === futureYear) {
          items.push({
            name: l.name, value: l.value, type: 'despesa',
            dueInfo: dt.toLocaleDateString('pt-BR'),
            unit: l.unit || '',
          });
        }
      });

      // Filter by unit if selected
      const filteredItems = (d.selectedUnit && d.selectedUnit !== 'all') ? items.filter(item =>
        !item.unit || item.unit === d.selectedUnit
      ) : items;

      const total = filteredItems.reduce((s, i) => s + i.value, 0);
      months.push({ label: monthLabel, items: filteredItems, total });
    }
    return months;
  }, [d.fixedExpenses, d.bills, d.logs, d.selectedUnit]);

  return (
    <div>
      {/* Sub-tab pills */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
        background: 'var(--card-bg)', padding: '12px 16px', borderRadius: 14,
        border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {SUB_TABS.map(t => {
          const isActive = sub === t.key;
          return (
            <button key={t.key} onClick={() => setSub(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 12,
                border: `2px solid ${isActive ? t.color : 'transparent'}`,
                background: isActive ? `${t.color}10` : 'var(--bg)',
                color: isActive ? t.color : 'var(--text-muted)',
                fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.2s',
                boxShadow: isActive ? `0 2px 12px ${t.color}15` : 'none',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = `${t.color}06`; e.currentTarget.style.color = t.color; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-muted)'; }}}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {sub === 'fixos' && (
        <FixedCostsSection
          fixedExpenses={d.fixedExpenses} fixedName={d.fixedName} setFixedName={d.setFixedName}
          fixedValue={d.fixedValue} setFixedValue={d.setFixedValue}
          fixedCategory={d.fixedCategory} setFixedCategory={d.setFixedCategory}
          fixedDate={d.fixedDate} setFixedDate={d.setFixedDate}
          fixedUnit={d.fixedUnit} setFixedUnit={d.setFixedUnit}
          addFixed={d.addFixed} deleteFixed={d.deleteFixed} editFixed={d.editFixed}
          bills={d.bills} billName={d.billName} setBillName={d.setBillName}
          billValue={d.billValue} setBillValue={d.setBillValue}
          billType={d.billType} setBillType={d.setBillType}
          billDueDay={d.billDueDay} setBillDueDay={d.setBillDueDay}
          billDueDate={d.billDueDate} setBillDueDate={d.setBillDueDate}
          billCategory={d.billCategory} setBillCategory={d.setBillCategory}
          addBill={d.addBill} deleteBill={d.deleteBill}
          hideBills
          totalRev={d.totalRev}
          selectedUnit={d.selectedUnit}
        />
      )}

      {sub === 'contas' && (
        <FixedCostsSection
          fixedExpenses={d.fixedExpenses} fixedName={d.fixedName} setFixedName={d.setFixedName}
          fixedValue={d.fixedValue} setFixedValue={d.setFixedValue}
          fixedCategory={d.fixedCategory} setFixedCategory={d.setFixedCategory}
          fixedDate={d.fixedDate} setFixedDate={d.setFixedDate}
          fixedUnit={d.fixedUnit} setFixedUnit={d.setFixedUnit}
          addFixed={d.addFixed} deleteFixed={d.deleteFixed} editFixed={d.editFixed}
          bills={d.bills} billName={d.billName} setBillName={d.setBillName}
          billValue={d.billValue} setBillValue={d.setBillValue}
          billType={d.billType} setBillType={d.setBillType}
          billDueDay={d.billDueDay} setBillDueDay={d.setBillDueDay}
          billDueDate={d.billDueDate} setBillDueDate={d.setBillDueDate}
          billCategory={d.billCategory} setBillCategory={d.setBillCategory}
          addBill={d.addBill} deleteBill={d.deleteBill}
          hideFixed
          totalRev={d.totalRev}
          selectedUnit={d.selectedUnit}
        />
      )}

      {sub === 'despesas' && (
        <CostsSection
          costName={d.costName} setCostName={d.setCostName}
          costValue={d.costValue} setCostValue={d.setCostValue}
          costDate={d.costDate} setCostDate={d.setCostDate}
          costCategory={d.costCategory} setCostCategory={d.setCostCategory}
          costUnit={d.costUnit} setCostUnit={d.setCostUnit}
          costObs={d.costObs} setCostObs={d.setCostObs}
          addCost={d.addCost} items={d.filteredLogs}
          deleteLogByDate={d.deleteLogByDate} updateLog={d.updateLog}
          selectedUnit={d.selectedUnit}
        />
      )}

      {sub === 'futuro' && (
        <div>

          {/* Future costs header */}
          <div style={{...(cardS as any), padding: '20px 24px', marginBottom: 16}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              <div style={{width:42,height:42,borderRadius:14,background:'linear-gradient(135deg,#f59e0b,#fbbf24)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(245,158,11,0.3)'}}>
                <span className="material-symbols-outlined" style={{fontSize:20,color:'#fff'}}>schedule</span>
              </div>
              <div>
                <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:800}}>Projeção de Custos Futuros</h2>
                <p style={{margin:0,fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600}}>Previsão dos próximos 3 meses baseada em custos fixos e contas recorrentes</p>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {futureCosts.map((month, mi) => (
                <div key={mi} style={{
                  padding:16,borderRadius:14,
                  background: mi === 0 ? 'rgba(245,158,11,0.06)' : 'var(--bg)',
                  border: mi === 0 ? '2px solid rgba(245,158,11,0.2)' : '1px solid var(--border)',
                  transition:'all 0.2s',
                }}>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'capitalize',marginBottom:4}}>{month.label}</div>
                  <div style={{fontSize:'1.2rem',fontWeight:900,color: mi === 0 ? '#f59e0b' : 'var(--text-main)'}}>{fmt(month.total)}</div>
                  <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2}}>{month.items.length} itens previstos</div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed breakdown per month */}
          {futureCosts.map((month, mi) => (
            <div key={mi} style={{...(cardS as any), padding: '20px 24px', marginBottom: 12}}>
              <h3 style={{margin:'0 0 12px',fontSize:'0.95rem',fontWeight:800,display:'flex',alignItems:'center',gap:8,textTransform:'capitalize'}}>
                <span className="material-symbols-outlined" style={{fontSize:18,color:'#f59e0b'}}>calendar_month</span>
                {month.label}
                <span style={{marginLeft:'auto',fontSize:'0.78rem',fontWeight:800,padding:'4px 12px',borderRadius:8,background:'rgba(245,158,11,0.08)',color:'#f59e0b'}}>
                  {fmt(month.total)}
                </span>
              </h3>
              {month.items.length === 0 ? (
                <p style={{color:'var(--text-muted)',fontSize:'0.85rem',textAlign:'center',padding:20}}>Nenhum custo previsto.</p>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {month.items.map((item, ii) => (
                    <div key={ii} style={{
                      display:'flex',justifyContent:'space-between',alignItems:'center',
                      padding:'10px 14px',borderRadius:10,
                      background: ii % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                    }}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{
                          width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',
                          background: item.type === 'fixo' ? 'rgba(139,92,246,0.08)' : item.type === 'despesa' ? 'rgba(239,68,68,0.08)' : item.type === 'conta' ? 'rgba(156,39,176,0.08)' : 'rgba(59,130,246,0.08)',
                        }}>
                          <span className="material-symbols-outlined" style={{fontSize:14,
                            color: item.type === 'fixo' ? '#8b5cf6' : item.type === 'despesa' ? '#ef4444' : item.type === 'conta' ? '#9c27b0' : '#3b82f6',
                          }}>{item.type === 'fixo' ? 'repeat' : item.type === 'despesa' ? 'shopping_cart' : 'event_upcoming'}</span>
                        </div>
                        <div>
                          <div style={{fontWeight:700,fontSize:'0.85rem'}}>{item.name}</div>
                          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',display:'flex',gap:6}}>
                            <span style={{
                              padding:'1px 6px',borderRadius:5,fontSize:'0.62rem',fontWeight:700,
                              background: item.type === 'fixo' ? 'rgba(139,92,246,0.06)' : item.type === 'despesa' ? 'rgba(239,68,68,0.06)' : 'rgba(156,39,176,0.06)',
                              color: item.type === 'fixo' ? '#8b5cf6' : item.type === 'despesa' ? '#ef4444' : '#9c27b0',
                            }}>{item.type === 'fixo' ? 'Custo Fixo' : item.type === 'despesa' ? 'Despesa' : 'Conta'}</span>
                            <span>{item.dueInfo}</span>
                          </div>
                        </div>
                      </div>
                      <strong style={{fontWeight:800,fontSize:'0.88rem',color:'#ef4444'}}>{fmt(item.value)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
