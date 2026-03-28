'use client';
import React from 'react';
import { LogEntry, cardS } from '@/hooks/useDashboard';

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7h-20h
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function AppointmentHeatmap({ logs }: Props) {
  // Build heatmap from logs dates (simulate from log dates)
  const heatmap: number[][] = DAYS.map(() => HOURS.map(() => 0));
  
  logs.forEach(l => {
    const d = new Date(l.date);
    const day = d.getDay();
    const hour = d.getHours();
    if (hour >= 7 && hour <= 20) {
      heatmap[day][hour - 7]++;
    }
  });

  const maxVal = Math.max(...heatmap.flat(), 1);

  const getColor = (val: number) => {
    if (val === 0) return 'var(--bg)';
    const intensity = val / maxVal;
    if (intensity > 0.75) return '#dc2626';
    if (intensity > 0.5) return '#f59e0b';
    if (intensity > 0.25) return '#10b981';
    return 'rgba(16,185,129,0.25)';
  };

  // Peak analysis
  const peaks: { day: string; hour: string; count: number }[] = [];
  heatmap.forEach((row, dayIdx) => {
    row.forEach((count, hourIdx) => {
      if (count > 0) peaks.push({ day: DAYS[dayIdx], hour: `${HOURS[hourIdx]}h`, count });
    });
  });
  peaks.sort((a, b) => b.count - a.count);
  const topPeaks = peaks.slice(0, 5);
  const lowPeaks = peaks.filter(p => p.count > 0).sort((a, b) => a.count - b.count).slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#ef4444' }}>local_fire_department</span>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Mapa de Calor — Horários de Pico</h3>
      </div>

      <div style={cardS}>
        {/* Heatmap grid */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${HOURS.length}, 1fr)`, gap: 3, minWidth: 500 }}>
            <div /> {/* corner */}
            {HOURS.map(h => (
              <div key={h} style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{h}h</div>
            ))}
            {DAYS.map((day, dayIdx) => (
              <React.Fragment key={day}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{day}</div>
                {HOURS.map((_, hourIdx) => {
                  const val = heatmap[dayIdx][hourIdx];
                  return (
                    <div key={hourIdx} title={`${day} ${HOURS[hourIdx]}h: ${val} agendamentos`} style={{
                      borderRadius: 4, background: getColor(val), minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 700, color: val > maxVal * 0.5 ? '#fff' : 'var(--text-muted)', cursor: 'default', transition: 'all 0.2s',
                    }}>
                      {val > 0 ? val : ''}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, justifyContent: 'center' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>Menos</span>
          {['var(--bg)', 'rgba(16,185,129,0.25)', '#10b981', '#f59e0b', '#dc2626'].map((c, i) => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: 3, background: c, border: '1px solid var(--border)' }} />
          ))}
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>Mais</span>
        </div>
      </div>

      {/* Peak analysis */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={cardS}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' as const, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_up</span> Top Horários de Pico
          </div>
          {topPeaks.length === 0 ? <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: 10 }}>Sem dados</div> :
            topPeaks.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: '0.82rem' }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.72rem', color: i < 2 ? '#fff' : 'var(--text-muted)' }}>{i + 1}</span>
                <span style={{ fontWeight: 700 }}>{p.day} {p.hour}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 900, color: '#ef4444' }}>{p.count}</span>
              </div>
            ))
          }
        </div>
        <div style={cardS}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' as const, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_down</span> Horários com Mais Disponibilidade
          </div>
          {lowPeaks.length === 0 ? <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: 10 }}>Sem dados</div> :
            lowPeaks.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: '0.82rem' }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.72rem', color: '#10b981' }}>{i + 1}</span>
                <span style={{ fontWeight: 700 }}>{p.day} {p.hour}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 900, color: '#10b981' }}>{p.count}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
