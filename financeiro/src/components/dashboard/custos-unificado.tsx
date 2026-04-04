'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { FixedCostsSection } from '@/components/dashboard/fixed-costs-section';
import { CostsSection } from '@/components/dashboard/costs-section';
import { cardS, fmt, UNITS, MONTHS } from '@/hooks/useDashboard';

type CustoSubTab = 'fixos' | 'contas' | 'despesas' | 'futuro';

const SUB_TABS: { key: CustoSubTab; label: string; icon: string; color: string }[] = [
  { key: 'fixos',    label: 'Custos Fixos',        icon: 'repeat',         color: '#8b5cf6' },
  { key: 'contas',   label: 'Contas a Pagar',      icon: 'event_upcoming', color: '#3b82f6' },
  { key: 'despesas', label: 'Despesas Variáveis',   icon: 'trending_down',  color: '#ef4444' },
  { key: 'futuro',   label: 'Custos Futuros',       icon: 'schedule',       color: '#f59e0b' },
];

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ─── Period Selector Component ─── */
function PeriodSelector({
  selectedMonth, setSelectedMonth,
  selectedYear, setSelectedYear,
}: {
  selectedMonth: number; setSelectedMonth: (m: number) => void;
  selectedYear: number; setSelectedYear: (y: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedYear);
  const pickerRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goToPrev = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNext = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const goToToday = () => {
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
  };

  const selectMonth = (m: number) => {
    setSelectedMonth(m);
    setSelectedYear(pickerYear);
    setShowPicker(false);
  };

  const isFutureMonth = (m: number, y: number) => {
    return y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} ref={pickerRef}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--card-bg)', borderRadius: 14,
        border: '1px solid var(--border)',
        padding: '6px 8px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Prev */}
        <button onClick={goToPrev} style={{
          width: 34, height: 34, borderRadius: 10, border: 'none',
          background: 'var(--bg)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
        </button>

        {/* Month/Year label (clickable to open picker) */}
        <button onClick={() => { setPickerYear(selectedYear); setShowPicker(!showPicker); }} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 16px', borderRadius: 10,
          border: showPicker ? '2px solid var(--primary)' : '1px solid transparent',
          background: showPicker ? 'var(--primary-light)' : 'transparent',
          cursor: 'pointer', fontFamily: 'inherit',
          color: 'var(--text-main)', fontWeight: 800,
          fontSize: '0.92rem', transition: 'all 0.2s',
          minWidth: 170, justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 18, color: 'var(--primary)',
          }}>calendar_month</span>
          {MONTHS[selectedMonth]} {selectedYear}
          <span className="material-symbols-outlined" style={{
            fontSize: 16, color: 'var(--text-muted)',
            transition: 'transform 0.2s',
            transform: showPicker ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>expand_more</span>
        </button>

        {/* Next */}
        <button onClick={goToNext} style={{
          width: 34, height: 34, borderRadius: 10, border: 'none',
          background: 'var(--bg)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
        </button>

        {/* Today button */}
        {!isCurrentMonth && (
          <button onClick={goToToday} title="Mês atual" style={{
            height: 34, borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
            cursor: 'pointer', padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 5,
            color: '#fff', fontWeight: 700, fontSize: '0.75rem',
            fontFamily: 'inherit', transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(230,0,126,0.25)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>today</span>
            Hoje
          </button>
        )}
      </div>

      {/* Month/Year Picker Dropdown */}
      {showPicker && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          width: 340, padding: 20,
          background: 'var(--card-bg)', borderRadius: 18,
          border: '1px solid var(--border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 200,
          animation: 'pickerDropIn 0.2s ease-out',
        }}>
          {/* Year nav */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <button onClick={() => setPickerYear(pickerYear - 1)} style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'var(--bg)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', transition: 'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
            </button>
            <span style={{
              fontWeight: 900, fontSize: '1.05rem', color: 'var(--text-main)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>date_range</span>
              {pickerYear}
            </span>
            <button onClick={() => setPickerYear(pickerYear + 1)} style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'var(--bg)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', transition: 'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
            </button>
          </div>

          {/* Month grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          }}>
            {MONTHS_SHORT.map((label, m) => {
              const isSelected = m === selectedMonth && pickerYear === selectedYear;
              const isCurrent = m === now.getMonth() && pickerYear === now.getFullYear();
              const isFuture = isFutureMonth(m, pickerYear);

              return (
                <button key={m} onClick={() => selectMonth(m)} style={{
                  padding: '10px 4px', borderRadius: 10, border: 'none',
                  background: isSelected
                    ? 'linear-gradient(135deg, var(--primary), #ff4db1)'
                    : isCurrent
                      ? 'var(--primary-light)'
                      : 'var(--bg)',
                  color: isSelected
                    ? '#fff'
                    : isCurrent
                      ? 'var(--primary)'
                      : isFuture
                        ? 'var(--text-muted)'
                        : 'var(--text-main)',
                  fontWeight: isSelected || isCurrent ? 800 : 600,
                  fontSize: '0.82rem', cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  boxShadow: isSelected ? '0 4px 12px rgba(230,0,126,0.3)' : 'none',
                  opacity: isFuture ? 0.5 : 1,
                  position: 'relative',
                }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(230,0,126,0.08)';
                      e.currentTarget.style.color = 'var(--primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = isCurrent ? 'var(--primary-light)' : 'var(--bg)';
                      e.currentTarget.style.color = isCurrent ? 'var(--primary)' : isFuture ? 'var(--text-muted)' : 'var(--text-main)';
                    }
                  }}
                >
                  {label}
                  {isCurrent && !isSelected && (
                    <span style={{
                      position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                      width: 4, height: 4, borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div style={{
            display: 'flex', gap: 8, marginTop: 14, paddingTop: 14,
            borderTop: '1px solid var(--border)',
          }}>
            <button onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); setShowPicker(false); }} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>today</span>
              Mês Atual
            </button>
            <button onClick={() => {
              const pm = selectedMonth === 0 ? 11 : selectedMonth - 1;
              const py = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
              setSelectedMonth(pm); setSelectedYear(py); setShowPicker(false);
            }} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>undo</span>
              Mês Anterior
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pickerDropIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.96); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

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

  const now = new Date();
  const isCurrentMonth = d.selectedMonth === now.getMonth() && d.selectedYear === now.getFullYear();

  return (
    <div>
      {/* ─── Period Selector ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <PeriodSelector
          selectedMonth={d.selectedMonth}
          setSelectedMonth={d.setSelectedMonth}
          selectedYear={d.selectedYear}
          setSelectedYear={d.setSelectedYear}
        />

        {/* Current period indicator */}
        {!isCurrentMonth && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 10,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.15)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>info</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}>
              Visualizando {MONTHS[d.selectedMonth]} de {d.selectedYear}
            </span>
          </div>
        )}
      </div>

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
