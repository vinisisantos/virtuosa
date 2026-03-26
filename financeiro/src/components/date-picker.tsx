'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

interface DatePickerProps {
  value: string; // DD/MM/YYYY or YYYY-MM-DD
  onChange: (val: string) => void;
  label?: string;
  style?: React.CSSProperties;
}

const DAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(month: number, year: number) {
  return new Date(year, month, 1).getDay();
}

export function DatePicker({ value, onChange, style }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Parse value
  const parseDate = (v: string) => {
    if (!v) return { d: '', m: '', y: '' };
    // Handle YYYY-MM-DD
    if (v.includes('-')) {
      const [y, m, d] = v.split('-');
      return { d: d || '', m: m || '', y: y || '' };
    }
    // Handle DD/MM/YYYY
    const [d, m, y] = v.split('/');
    return { d: d || '', m: m || '', y: y || '' };
  };

  const parsed = parseDate(value);
  const [day, setDay] = useState(parsed.d);
  const [month, setMonth] = useState(parsed.m);
  const [year, setYear] = useState(parsed.y);

  useEffect(() => {
    const p = parseDate(value);
    setDay(p.d);
    setMonth(p.m);
    setYear(p.y);
  }, [value]);

  const emitChange = useCallback((d: string, m: string, y: string) => {
    if (d && m && y && y.length === 4) {
      onChange(`${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`);
    }
  }, [onChange]);

  // Calendar state
  const today = new Date();
  const calMonth = month ? parseInt(month) - 1 : today.getMonth();
  const calYear = year && year.length === 4 ? parseInt(year) : today.getFullYear();
  const [viewMonth, setViewMonth] = useState(calMonth);
  const [viewYear, setViewYear] = useState(calYear);

  useEffect(() => {
    if (open) {
      setViewMonth(month ? parseInt(month) - 1 : today.getMonth());
      setViewYear(year && year.length === 4 ? parseInt(year) : today.getFullYear());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDay = (v: string) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 2);
    setDay(cleaned);
    if (cleaned.length === 2) {
      monthRef.current?.focus();
      monthRef.current?.select();
    }
  };
  const handleMonth = (v: string) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 2);
    setMonth(cleaned);
    if (cleaned.length === 2) {
      yearRef.current?.focus();
      yearRef.current?.select();
    }
  };
  const handleYear = (v: string) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 4);
    setYear(cleaned);
    if (cleaned.length === 4) {
      emitChange(day, month, cleaned);
    }
  };

  const handleDayBlur = () => emitChange(day, month, year);
  const handleMonthBlur = () => emitChange(day, month, year);

  const selectDate = (d: number) => {
    const dd = String(d).padStart(2, '0');
    const mm = String(viewMonth + 1).padStart(2, '0');
    const yy = String(viewYear);
    setDay(dd);
    setMonth(mm);
    setYear(yy);
    onChange(`${dd}/${mm}/${yy}`);
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const prevYear = () => setViewYear(viewYear - 1);
  const nextYear = () => setViewYear(viewYear + 1);

  // Calendar grid
  const daysInMonth = getDaysInMonth(viewMonth, viewYear);
  const firstDay = getFirstDayOfMonth(viewMonth, viewYear);
  const prevDays = getDaysInMonth(viewMonth === 0 ? 11 : viewMonth - 1, viewMonth === 0 ? viewYear - 1 : viewYear);
  const todayD = today.getDate(), todayM = today.getMonth(), todayY = today.getFullYear();
  const selD = parseInt(day), selM = parseInt(month) - 1, selY = parseInt(year);

  const cells: { day: number; current: boolean; isToday: boolean; isSelected: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false, isToday: false, isSelected: false });
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i, current: true,
      isToday: i === todayD && viewMonth === todayM && viewYear === todayY,
      isSelected: i === selD && viewMonth === selM && viewYear === selY,
    });
  }
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) cells.push({ day: i, current: false, isToday: false, isSelected: false });

  const primary = 'var(--primary, #8b5cf6)';

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'center', border: '2px solid var(--border)', borderRadius: 12,
        padding: '0 12px', background: 'var(--bg)', transition: 'border-color 0.2s, box-shadow 0.2s',
        height: 48, cursor: 'text',
      }}
        onClick={() => dayRef.current?.focus()}
        onFocus={() => {}}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          <input ref={dayRef} value={day} onChange={e => handleDay(e.target.value)} onBlur={handleDayBlur}
            placeholder="DD" maxLength={2}
            style={{ width: 30, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 600, fontFamily: 'inherit', textAlign: 'center', color: 'var(--text-main)', padding: 0 }}
            onFocus={e => e.target.select()}
          />
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '1rem' }}>/</span>
          <input ref={monthRef} value={month} onChange={e => handleMonth(e.target.value)} onBlur={handleMonthBlur}
            placeholder="MM" maxLength={2}
            style={{ width: 30, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 600, fontFamily: 'inherit', textAlign: 'center', color: 'var(--text-main)', padding: 0 }}
            onFocus={e => e.target.select()}
          />
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '1rem' }}>/</span>
          <input ref={yearRef} value={year} onChange={e => handleYear(e.target.value)}
            placeholder="AAAA" maxLength={4}
            style={{ width: 50, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 600, fontFamily: 'inherit', textAlign: 'center', color: 'var(--text-main)', padding: 0 }}
            onFocus={e => e.target.select()}
          />
        </div>
        <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>calendar_today</span>
        </button>
      </div>

      {/* Calendar dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 999,
          background: 'var(--card-bg)', border: `2px solid ${primary}`, borderRadius: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: 16, minWidth: 300,
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={prevYear} style={navBtn}>«</button>
              <button onClick={prevMonth} style={navBtn}>‹</button>
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
              {MONTHS_PT[viewMonth]} {viewYear}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={nextMonth} style={navBtn}>›</button>
              <button onClick={nextYear} style={navBtn}>»</button>
            </div>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
            {DAYS_PT.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', padding: '6px 0' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((cell, i) => (
              <button key={i} onClick={() => cell.current && selectDate(cell.day)}
                style={{
                  width: 38, height: 38, borderRadius: 10, border: 'none', fontFamily: 'inherit',
                  fontSize: '0.88rem', fontWeight: cell.isSelected || cell.isToday ? 800 : 500,
                  cursor: cell.current ? 'pointer' : 'default',
                  color: cell.isSelected ? '#fff' : !cell.current ? 'var(--text-muted)' : cell.isToday ? primary : 'var(--text-main)',
                  background: cell.isSelected ? primary : cell.isToday ? `${primary}15` : 'transparent',
                  opacity: cell.current ? 1 : 0.35,
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { if (cell.current && !cell.isSelected) e.currentTarget.style.background = `${primary}12`; }}
                onMouseLeave={e => { if (cell.current && !cell.isSelected) e.currentTarget.style.background = cell.isToday ? `${primary}15` : 'transparent'; }}
              >
                {cell.day}
              </button>
            ))}
          </div>

          {/* Today shortcut */}
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <button onClick={() => selectDate(todayD)} style={{
              background: 'none', border: 'none', color: primary, fontWeight: 700,
              fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 12px',
            }}>
              Hoje
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg)',
  color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '1rem',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
  transition: 'all 0.15s',
};
