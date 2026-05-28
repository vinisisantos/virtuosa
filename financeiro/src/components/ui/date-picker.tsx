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
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
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
  useEffect(() => {
    if (!open) return;
    const anchor = containerRef.current;
    if (!anchor) return;
    const updatePos = () => {
      const rect = anchor.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  const prevMonth = useCallback(() => {
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });
  }, []);

  const selectDay = (day: number) => {
    onChange(formatDateStr(viewYear, viewMonth, day));
    setOpen(false);
    setIsYearPicker(false);
  };

  // Auto-format typed date input (DD/MM/YYYY)
  const handleTypedInput = (raw: string) => {
    // Only allow digits and slashes
    let cleaned = raw.replace(/[^\d/]/g, '');

    // Auto-insert slashes
    const digits = cleaned.replace(/\//g, '');
    if (digits.length <= 2) {
      cleaned = digits;
    } else if (digits.length <= 4) {
      cleaned = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      cleaned = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }

    setTypedValue(cleaned);

    // Try to parse complete date
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

  const handleTypedBlur = () => {
    // On blur, re-sync with the actual value
    setTypedValue(formatDisplayDate(value));
  };

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
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(o => !o); setIsYearPicker(false);
  };

  const isInput = variant === 'input';
  const isCompact = variant === 'compact';

  return (
    <div ref={containerRef} style={{ display: isInput || isCompact ? 'block' : 'inline-block', width: isInput || isCompact ? '100%' : undefined }}>
      {label && !isInput && !isCompact && (
        <label style={{
          display: 'block', fontSize: '0.68rem', fontWeight: 700,
          color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.5px', marginBottom: 4,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>event</span>
          {label}
        </label>
      )}

      {isCompact ? (
        /* ── Compact variant: small filter input ── */
        <div style={{
          display: 'flex', alignItems: 'center',
          width: '100%', borderRadius: 8,
          border: `1px solid ${open ? 'var(--primary, #e6007e)' : 'var(--border)'}`,
          background: 'var(--bg)', height: 36, boxSizing: 'border-box' as const,
          boxShadow: open ? '0 0 0 2px rgba(230,0,126,0.12)' : 'none',
          transition: 'all 0.2s', overflow: 'hidden', cursor: 'pointer',
          ...(inputStyle || {}),
        }} onClick={openCalendar}>
          <span className="material-symbols-outlined" style={{
            fontSize: 15, color: open ? 'var(--primary, #e6007e)' : 'var(--text-muted)',
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
      ) : isInput ? (
        /* ── Input variant: editable text + calendar icon ── */
        <div style={{
          display: 'flex', alignItems: 'center',
          width: '100%', borderRadius: 12,
          border: `1px solid ${open ? '#3b82f6' : 'var(--border)'}`,
          background: 'var(--bg)', height: 46, boxSizing: 'border-box' as const,
          boxShadow: open ? '0 0 0 3px rgba(59,130,246,0.1)' : 'none',
          transition: 'all 0.2s', overflow: 'hidden',
          ...(inputStyle || {}),
        }}>
          <button
            ref={btnRef}
            type="button"
            onClick={openCalendar}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 42, height: '100%', flexShrink: 0,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: open ? '#3b82f6' : 'var(--text-muted)', transition: 'color 0.2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>calendar_today</span>
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
              background: 'transparent', color: 'var(--text-main)',
              fontWeight: 600, fontSize: '0.88rem', fontFamily: 'inherit',
              height: '100%', padding: '0 14px 0 0',
            }}
          />
        </div>
      ) : (
        /* ── Button variant: click to open ── */
        <button
          ref={btnRef}
          onClick={openCalendar}
          type="button"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 14px', borderRadius: 10,
            border: `2px solid ${open ? '#3b82f6' : 'var(--border)'}`,
            background: 'var(--bg)', color: 'var(--text-main)',
            fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all 0.2s', minWidth: 150,
            boxShadow: open ? '0 0 0 3px rgba(59,130,246,0.1)' : 'none',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: open ? '#3b82f6' : 'var(--text-muted)', flexShrink: 0 }}>calendar_today</span>
          <span style={{ flex: 1 }}>{formatDisplayDate(value) || placeholder || 'Selecione'}</span>
        </button>
      )}

      {/* Portal-rendered calendar dropdown */}
      {open && (
        <CalendarPortal>
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed', top: dropdownPos.top, left: dropdownPos.left,
              zIndex: 99999, width: 320, borderRadius: 16, overflow: 'hidden',
              background: 'var(--card-bg, #fff)',
              border: '1px solid var(--border, #e5e7eb)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.12)',
              animation: 'datePickerSlideIn 0.2s ease',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'linear-gradient(135deg, var(--primary, #e6007e), #ff4db1)',
            }}>
              <button onClick={isYearPicker ? () => setViewYear(y => y - 12) : prevMonth} style={navBtnStyle}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
              </button>
              <button
                onClick={() => setIsYearPicker(p => !p)}
                style={{
                  border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: 8,
                  padding: '4px 14px', cursor: 'pointer', color: '#fff',
                  fontWeight: 800, fontSize: '0.88rem', fontFamily: 'inherit',
                  transition: 'background 0.2s', backdropFilter: 'blur(4px)',
                }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.15)'; }}
              >
                {isYearPicker
                  ? `${yearStart} – ${yearStart + 11}`
                  : `${MONTH_NAMES[viewMonth]} ${viewYear}`}
              </button>
              <button onClick={isYearPicker ? () => setViewYear(y => y + 12) : nextMonth} style={navBtnStyle}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
              </button>
            </div>

            {isYearPicker ? (
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {years.map(y => {
                  const isCurrent = y === new Date().getFullYear();
                  const isSelected = y === viewYear;
                  return (
                    <button
                      key={y}
                      onClick={() => { setViewYear(y); setIsYearPicker(false); }}
                      style={{
                        padding: '10px 0', borderRadius: 10, border: 'none',
                        background: isSelected ? 'linear-gradient(135deg, var(--primary, #e6007e), #ff4db1)' : 'transparent',
                        color: isSelected ? '#fff' : isCurrent ? 'var(--primary, #e6007e)' : 'var(--text-main, #222)',
                        fontWeight: isSelected || isCurrent ? 800 : 600, fontSize: '0.85rem',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget).style.background = 'rgba(230,0,126,0.08)'; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget).style.background = 'transparent'; }}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '8px 12px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                  {WEEKDAYS.map((d, i) => (
                    <div key={i} style={{
                      textAlign: 'center', fontSize: '0.68rem', fontWeight: 800,
                      color: i === 0 ? '#ef4444' : 'var(--text-muted, #888)',
                      padding: '6px 0', textTransform: 'uppercase',
                    }}>{d}</div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                  {cells.map((cell, i) => {
                    const isToday = cell.dateStr === todayStr;
                    const isSelected = cell.dateStr === selectedStr;
                    const isSunday = i % 7 === 0;
                    const isDisabled = !cell.inMonth;

                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (cell.inMonth) selectDay(cell.day);
                          else {
                            const p = parseDateStr(cell.dateStr);
                            if (p) {
                              setViewMonth(p.month);
                              setViewYear(p.year);
                              onChange(cell.dateStr);
                              setOpen(false);
                            }
                          }
                        }}
                        style={{
                          width: '100%', aspectRatio: '1', borderRadius: 10, border: 'none',
                          background: isSelected
                            ? 'linear-gradient(135deg, var(--primary, #e6007e), #ff4db1)'
                            : isToday
                              ? 'rgba(230,0,126,0.08)'
                              : 'transparent',
                          color: isSelected ? '#fff'
                            : isDisabled ? 'var(--text-muted, #aaa)'
                            : isSunday ? '#ef4444'
                            : 'var(--text-main, #222)',
                          opacity: isDisabled ? 0.35 : 1,
                          fontWeight: isSelected || isToday ? 800 : 600,
                          fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.15s', position: 'relative',
                          boxShadow: isSelected ? '0 3px 10px rgba(230,0,126,0.3)' : 'none',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) (e.currentTarget).style.background = 'rgba(230,0,126,0.1)';
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            (e.currentTarget).style.background = isToday ? 'rgba(230,0,126,0.08)' : 'transparent';
                          }
                        }}
                      >
                        {cell.day}
                        {isToday && !isSelected && (
                          <div style={{
                            position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                            width: 4, height: 4, borderRadius: '50%', background: 'var(--primary, #e6007e)',
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{
                  marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border, #e5e7eb)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <button
                    onClick={() => {
                      const t = new Date();
                      onChange(formatDateStr(t.getFullYear(), t.getMonth(), t.getDate()));
                      setViewMonth(t.getMonth());
                      setViewYear(t.getFullYear());
                      setOpen(false);
                    }}
                    style={{
                      border: 'none', background: 'rgba(230,0,126,0.06)',
                      color: 'var(--primary, #e6007e)', fontWeight: 700, fontSize: '0.75rem',
                      padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(230,0,126,0.12)'; }}
                    onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(230,0,126,0.06)'; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>today</span>
                    Hoje
                  </button>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #888)', fontWeight: 600 }}>
                    {formatDisplayDate(todayStr)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CalendarPortal>
      )}

      <style>{`
        @keyframes datePickerSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: 'none',
  background: 'rgba(255,255,255,0.15)', color: '#fff',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'background 0.2s',
  backdropFilter: 'blur(4px)',
};
