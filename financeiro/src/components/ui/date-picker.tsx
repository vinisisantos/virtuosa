'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  minDate?: string;
  maxDate?: string;
  variant?: 'button' | 'input' | 'compact';
  inputStyle?: React.CSSProperties;
  placeholder?: string;
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function parseDateStr(s: string) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

function formatDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatDisplayDate(s: string) {
  const p = parseDateStr(s);
  if (!p) return '';
  return `${String(p.day).padStart(2, '0')}/${String(p.month + 1).padStart(2, '0')}/${p.year}`;
}

function CalendarPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function DatePicker({ value, onChange, label, variant = 'button', inputStyle, placeholder }: DatePickerProps) {
  const parsed = parseDateStr(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? new Date().getMonth());
  const [viewYear, setViewYear] = useState(parsed?.year ?? new Date().getFullYear());
  const [isYearPicker, setIsYearPicker] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 380 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Typed input state — DD/MM/YYYY
  const [typedValue, setTypedValue] = useState(formatDisplayDate(value));

  // Sync typed value when external value changes
  useEffect(() => {
    setTypedValue(formatDisplayDate(value));
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setIsYearPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Sync view when value changes externally
  useEffect(() => {
    const p = parseDateStr(value);
    if (p) { setViewMonth(p.month); setViewYear(p.year); }
  }, [value]);

  // Update position on scroll/resize while open
  const updatePos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const calW = 380;
    // Clamp so calendar doesn't go off-screen right
    const left = Math.min(rect.left, window.innerWidth - calW - 12);
    setDropdownPos({ top: rect.bottom + 8, left: Math.max(8, left), width: calW });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  const prevMonth = useCallback(() => {
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });
  }, []);

  const selectDay = (dateStr: string) => {
    onChange(dateStr);
    setOpen(false);
    setIsYearPicker(false);
  };

  // Auto-format typed date input (DD/MM/YYYY)
  const handleTypedInput = (raw: string) => {
    let cleaned = raw.replace(/[^\d/]/g, '');
    const digits = cleaned.replace(/\//g, '');
    if (digits.length <= 2) cleaned = digits;
    else if (digits.length <= 4) cleaned = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    else cleaned = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    setTypedValue(cleaned);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
      const [dd, mm, yyyy] = cleaned.split('/').map(Number);
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2100) {
        const dateStr = formatDateStr(yyyy, mm - 1, dd);
        onChange(dateStr);
        setViewMonth(mm - 1);
        setViewYear(yyyy);
      }
    }
  };

  const handleTypedBlur = () => setTypedValue(formatDisplayDate(value));

  // Calendar grid
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const today = new Date();
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedStr = value;

  const cells = useMemo(() => {
    const result: { day: number; inMonth: boolean; dateStr: string }[] = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      let m = viewMonth - 1, y = viewYear;
      if (m < 0) { m = 11; y--; }
      result.push({ day: d, inMonth: false, dateStr: formatDateStr(y, m, d) });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ day: d, inMonth: true, dateStr: formatDateStr(viewYear, viewMonth, d) });
    }
    const remaining = 42 - result.length;
    for (let d = 1; d <= remaining; d++) {
      let m = viewMonth + 1, y = viewYear;
      if (m > 11) { m = 0; y++; }
      result.push({ day: d, inMonth: false, dateStr: formatDateStr(y, m, d) });
    }
    return result;
  }, [viewMonth, viewYear, firstDayOfWeek, daysInMonth, daysInPrevMonth]);

  const yearStart = Math.floor(viewYear / 12) * 12;
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i);

  const openCalendar = () => {
    if (!open) updatePos();
    setOpen(o => !o);
    setIsYearPicker(false);
  };

  const isInput   = variant === 'input';
  const isCompact = variant === 'compact';

  // ── Shared input field inner styles ────────────────────────────────────────
  const calIcon = (size: number, color: string) => (
    <span className="material-symbols-outlined" style={{ fontSize: size, color, flexShrink: 0, transition: 'color 0.2s' }}>
      calendar_today
    </span>
  );

  // ── Render calendar ────────────────────────────────────────────────────────
  const CalendarDropdown = () => (
    <CalendarPortal>
      <div
        ref={dropdownRef}
        style={{
          position: 'fixed', top: dropdownPos.top, left: dropdownPos.left,
          zIndex: 99999, width: dropdownPos.width,
          borderRadius: 18, overflow: 'hidden',
          background: 'var(--card-bg, #16161e)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)',
          animation: 'dpSlideIn 0.18s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #e6007e 0%, #ff4db1 100%)',
        }}>
          <button
            type="button"
            onClick={isYearPicker ? () => setViewYear(y => y - 12) : prevMonth}
            style={navBtnS}
            onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.3)'; }}
            onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.18)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
          </button>

          <button
            type="button"
            onClick={() => setIsYearPicker(p => !p)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: '#fff', fontWeight: 800, fontSize: '1.05rem', fontFamily: 'inherit',
              letterSpacing: '-0.01em',
            }}
          >
            {isYearPicker
              ? `${yearStart} – ${yearStart + 11}`
              : `${MONTH_NAMES[viewMonth]} ${viewYear}`}
          </button>

          <button
            type="button"
            onClick={isYearPicker ? () => setViewYear(y => y + 12) : nextMonth}
            style={navBtnS}
            onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.3)'; }}
            onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.18)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
          </button>
        </div>

        {isYearPicker ? (
          /* ── Year picker grid ── */
          <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {years.map(y => {
              const isCurrent = y === new Date().getFullYear();
              const isSel = y === viewYear;
              return (
                <button
                  key={y} type="button"
                  onClick={() => { setViewYear(y); setIsYearPicker(false); }}
                  style={{
                    padding: '12px 0', borderRadius: 12, border: 'none',
                    background: isSel ? 'linear-gradient(135deg, #e6007e, #ff4db1)' : 'transparent',
                    color: isSel ? '#fff' : isCurrent ? '#e6007e' : 'var(--text-main, #ddd)',
                    fontWeight: isSel || isCurrent ? 800 : 600, fontSize: '0.9rem',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    boxShadow: isSel ? '0 4px 14px rgba(230,0,126,0.35)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget).style.background = 'rgba(230,0,126,0.1)'; }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget).style.background = 'transparent'; }}
                >
                  {y}
                </button>
              );
            })}
          </div>
        ) : (
          /* ── Day grid ── */
          <div style={{ padding: '14px 16px 16px' }}>
            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
              {WEEKDAYS.map((d, i) => (
                <div key={i} style={{
                  textAlign: 'center', fontSize: '0.72rem', fontWeight: 800,
                  color: i === 0 ? '#ef4444' : 'rgba(255,255,255,0.35)',
                  padding: '6px 0', letterSpacing: '0.04em',
                }}>{d}</div>
              ))}
            </div>

            {/* Days */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((cell, i) => {
                const isToday    = cell.dateStr === todayStr;
                const isSel      = cell.dateStr === selectedStr;
                const isSunday   = i % 7 === 0;
                const isOutside  = !cell.inMonth;

                return (
                  <button
                    key={i} type="button"
                    onClick={() => {
                      if (cell.inMonth) {
                        selectDay(cell.dateStr);
                      } else {
                        const p = parseDateStr(cell.dateStr);
                        if (p) { setViewMonth(p.month); setViewYear(p.year); onChange(cell.dateStr); setOpen(false); }
                      }
                    }}
                    style={{
                      position: 'relative',
                      width: '100%', aspectRatio: '1',
                      borderRadius: '50%', border: 'none',
                      background: isSel
                        ? 'linear-gradient(135deg, #e6007e, #ff4db1)'
                        : isToday
                          ? 'rgba(255,255,255,0.07)'
                          : 'transparent',
                      color: isSel ? '#fff'
                        : isOutside ? 'rgba(255,255,255,0.2)'
                        : isSunday ? '#ff6b6b'
                        : 'var(--text-main, #e8e8e8)',
                      fontWeight: isSel ? 800 : isToday ? 700 : 600,
                      fontSize: '0.88rem',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.15s',
                      boxShadow: isSel ? '0 4px 16px rgba(230,0,126,0.45)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={e => {
                      if (!isSel) (e.currentTarget).style.background = 'rgba(230,0,126,0.15)';
                    }}
                    onMouseLeave={e => {
                      if (!isSel) (e.currentTarget).style.background =
                        isToday ? 'rgba(255,255,255,0.07)' : 'transparent';
                    }}
                  >
                    {cell.day}
                    {/* Today dot */}
                    {isToday && !isSel && (
                      <span style={{
                        position: 'absolute', bottom: '12%', left: '50%', transform: 'translateX(-50%)',
                        width: 4, height: 4, borderRadius: '50%',
                        background: '#e6007e', display: 'block',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{
              marginTop: 14, paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <button
                type="button"
                onClick={() => {
                  const t = new Date();
                  onChange(formatDateStr(t.getFullYear(), t.getMonth(), t.getDate()));
                  setViewMonth(t.getMonth()); setViewYear(t.getFullYear());
                  setOpen(false);
                }}
                style={{
                  border: 'none', background: 'rgba(230,0,126,0.1)',
                  color: '#e6007e', fontWeight: 700, fontSize: '0.8rem',
                  padding: '6px 14px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(230,0,126,0.18)'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(230,0,126,0.1)'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>calendar_today</span>
                Hoje
              </button>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                {formatDisplayDate(todayStr)}
              </span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes dpSlideIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
    </CalendarPortal>
  );

  // ── Trigger: Compact variant (filter bars) ─────────────────────────────────
  if (isCompact) {
    return (
      <div ref={containerRef} style={{ display: 'block', width: '100%' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center',
            width: '100%', borderRadius: 8, height: 36,
            border: `1.5px solid ${open ? '#e6007e' : 'var(--border)'}`,
            background: 'var(--bg)', boxSizing: 'border-box' as const,
            boxShadow: open ? '0 0 0 3px rgba(230,0,126,0.14)' : 'none',
            transition: 'all 0.2s', overflow: 'hidden', cursor: 'pointer',
            ...(inputStyle || {}),
          }}
          onClick={openCalendar}
        >
          <span className="material-symbols-outlined" style={{
            fontSize: 14, color: open ? '#e6007e' : 'var(--text-muted)',
            padding: '0 8px', flexShrink: 0, transition: 'color 0.2s',
          }}>calendar_today</span>
          <input
            ref={inputRef}
            value={typedValue}
            onChange={e => handleTypedInput(e.target.value)}
            onBlur={handleTypedBlur}
            onFocus={e => { e.target.select(); if (!open) openCalendar(); }}
            placeholder={placeholder || 'DD/MM/AAAA'}
            maxLength={10}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--text-main)',
              fontWeight: 600, fontSize: '0.78rem', fontFamily: 'inherit',
              height: '100%', padding: '0 8px 0 0', cursor: 'text',
            }}
          />
        </div>
        {open && <CalendarDropdown />}
      </div>
    );
  }

  // ── Trigger: Input variant (form fields) ───────────────────────────────────
  if (isInput) {
    return (
      <div ref={containerRef} style={{ display: 'block', width: '100%' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center',
            width: '100%', borderRadius: 12, height: 48,
            border: `2px solid ${open ? '#e6007e' : 'var(--border)'}`,
            background: 'var(--bg)', boxSizing: 'border-box' as const,
            boxShadow: open ? '0 0 0 4px rgba(230,0,126,0.14)' : 'none',
            transition: 'all 0.2s', overflow: 'hidden',
            ...(inputStyle || {}),
          }}
        >
          <button
            ref={btnRef} type="button" onClick={openCalendar}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 46, height: '100%', flexShrink: 0,
              border: 'none', background: 'transparent', cursor: 'pointer',
            }}
          >
            {calIcon(20, open ? '#e6007e' : 'var(--text-muted)')}
          </button>
          <input
            ref={inputRef}
            value={typedValue}
            onChange={e => handleTypedInput(e.target.value)}
            onBlur={handleTypedBlur}
            onFocus={e => e.target.select()}
            placeholder={placeholder || 'DD/MM/AAAA'}
            maxLength={10}
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent',
              color: typedValue ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.95rem', fontFamily: 'inherit',
              height: '100%', padding: '0 14px 0 0',
            }}
          />
        </div>
        {open && <CalendarDropdown />}
      </div>
    );
  }

  // ── Trigger: Button variant ────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ display: 'inline-block' }}>
      <button
        ref={btnRef} type="button" onClick={openCalendar}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 10,
          border: `2px solid ${open ? '#e6007e' : 'var(--border)'}`,
          background: 'var(--bg)', color: 'var(--text-main)',
          fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all 0.2s', minWidth: 160,
          boxShadow: open ? '0 0 0 4px rgba(230,0,126,0.14)' : 'none',
        }}
      >
        {calIcon(18, open ? '#e6007e' : 'var(--text-muted)')}
        <span style={{ flex: 1 }}>{formatDisplayDate(value) || placeholder || 'Selecione'}</span>
      </button>
      {open && <CalendarDropdown />}
    </div>
  );
}

// ── Nav button style (shared) ───────────────────────────────────────────────
const navBtnS: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10, border: 'none',
  background: 'rgba(255,255,255,0.18)', color: '#fff',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'background 0.2s',
  flexShrink: 0,
};
