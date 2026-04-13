'use client';
import { useState, useRef, useEffect } from 'react';
import { FixedCostsSection } from '@/components/dashboard/fixed-costs-section';
import { CostsSection } from '@/components/dashboard/costs-section';
import { cardS, fmt, UNITS, MONTHS } from '@/hooks/useDashboard';

type CustoSubTab = 'fixos' | 'contas' | 'despesas';

const SUB_TABS: { key: CustoSubTab; label: string; icon: string }[] = [
  { key: 'fixos',    label: 'Custos Fixos',        icon: 'repeat' },
  { key: 'contas',   label: 'Contas a Pagar',      icon: 'event_upcoming' },
  { key: 'despesas', label: 'Despesas Variáveis',   icon: 'trending_down' },
];

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ─── Period Selector — Clean Inline ─── */
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goToPrev = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); }
    else setSelectedMonth(selectedMonth - 1);
  };
  const goToNext = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); }
    else setSelectedMonth(selectedMonth + 1);
  };

  const selectMonth = (m: number) => {
    setSelectedMonth(m); setSelectedYear(pickerYear); setShowPicker(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} ref={pickerRef}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        background: 'var(--card-bg)', borderRadius: 12,
        border: '1px solid var(--border)', padding: '4px 6px',
      }}>
        <button onClick={goToPrev} style={{
          width: 32, height: 32, borderRadius: 8, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-main)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
        </button>

        <button onClick={() => { setPickerYear(selectedYear); setShowPicker(!showPicker); }} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 8,
          border: 'none',
          background: showPicker ? 'var(--bg)' : 'transparent',
          cursor: 'pointer', fontFamily: 'inherit',
          color: 'var(--text-main)', fontWeight: 700,
          fontSize: '0.88rem', transition: 'all 0.15s',
        }}>
          {MONTHS[selectedMonth]} {selectedYear}
          <span className="material-symbols-outlined" style={{
            fontSize: 14, color: 'var(--text-muted)',
            transition: 'transform 0.2s',
            transform: showPicker ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>expand_more</span>
        </button>

        <button onClick={goToNext} style={{
          width: 32, height: 32, borderRadius: 8, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-main)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
        </button>

        {!isCurrentMonth && (
          <button onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); }} title="Mês atual" style={{
            height: 30, borderRadius: 8, border: 'none',
            background: 'var(--primary)', cursor: 'pointer', padding: '0 10px',
            display: 'flex', alignItems: 'center', gap: 4,
            color: '#fff', fontWeight: 700, fontSize: '0.72rem',
            fontFamily: 'inherit', transition: 'all 0.15s',
            marginLeft: 2,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>today</span>
            Hoje
          </button>
        )}
      </div>

      {/* Month/Year picker dropdown */}
      {showPicker && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          width: 300, padding: 16,
          background: 'var(--card-bg)', borderRadius: 14,
          border: '1px solid var(--border)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          zIndex: 200, animation: 'pickerDrop 0.15s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => setPickerYear(pickerYear - 1)} style={{
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'var(--bg)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', transition: 'all 0.15s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>{pickerYear}</span>
            <button onClick={() => setPickerYear(pickerYear + 1)} style={{
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'var(--bg)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', transition: 'all 0.15s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MONTHS_SHORT.map((label, m) => {
              const isSelected = m === selectedMonth && pickerYear === selectedYear;
              const isCurrent = m === now.getMonth() && pickerYear === now.getFullYear();
              return (
                <button key={m} onClick={() => selectMonth(m)} style={{
                  padding: '8px 4px', borderRadius: 8, border: 'none',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: isSelected || isCurrent ? 700 : 500,
                  fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.12s',
                }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pickerDrop {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export function CustosUnificado({ d }: { d: any }) {
  const [sub, setSub] = useState<CustoSubTab>('fixos');

  const now = new Date();
  const isCurrentMonth = d.selectedMonth === now.getMonth() && d.selectedYear === now.getFullYear();

  return (
    <div>
      {/* ─── Top Bar: Period + Tabs ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <PeriodSelector
          selectedMonth={d.selectedMonth}
          setSelectedMonth={d.setSelectedMonth}
          selectedYear={d.selectedYear}
          setSelectedYear={d.setSelectedYear}
        />

        {!isCurrentMonth && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.12)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#f59e0b' }}>info</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f59e0b' }}>
              {MONTHS[d.selectedMonth]} de {d.selectedYear}
            </span>
          </div>
        )}
      </div>

      {/* ─── Tab Navigation — Clean Underline Style ─── */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 24,
        borderBottom: '1px solid var(--border)',
      }}>
        {SUB_TABS.map(t => {
          const isActive = sub === t.key;
          return (
            <button key={t.key} onClick={() => setSub(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '12px 20px',
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                background: 'none',
                color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 500, fontSize: '0.85rem',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-main)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <span className="material-symbols-outlined" style={{
                fontSize: 18, color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                transition: 'color 0.15s',
              }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── Content ─── */}
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
    </div>
  );
}
