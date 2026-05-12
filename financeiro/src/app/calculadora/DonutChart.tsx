'use client';
import React from 'react';
import { fmt } from './useCalc';

interface Slice { label: string; value: number; color: string }

export function DonutChart({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) return null;
  let cum = 0;
  const size = 180, cx = 90, cy = 90, r = 65, sw = 24;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((sl, i) => {
          const pct = sl.value / total;
          const dash = pct * circ;
          const offset = cum * circ;
          cum += pct;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={sl.color} strokeWidth={sw}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'all 0.6s ease' }} />
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slices.map((sl, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: sl.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 110 }}>{sl.label}</span>
            <span style={{ fontWeight: 800, marginLeft: 'auto' }}>{fmt(sl.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
