'use client';
import React, { useState, useEffect } from 'react';
import { cardS, fmt } from '@/hooks/useDashboard';

interface Profissional { id: string; name: string; specialty: string; color: string; unit: string; }
interface Agendamento { id: string; clientName: string; procedimento: string; profissionalId: string; startTime: string; endTime: string; status: string; unit: string; }

export function ProfessionalDashboard() {
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProf, setSelectedProf] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/profissionais').then(r => r.json()),
      fetch('/api/agenda').then(r => r.json()),
    ]).then(([profs, ags]) => {
      setProfissionais(Array.isArray(profs) ? profs : profs.profissionais || []);
      setAgendamentos(Array.isArray(ags) ? ags : ags.agendamentos || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const profStats = profissionais.map(p => {
    const profAgs = agendamentos.filter(a => a.profissionalId === p.id);
    const monthAgs = profAgs.filter(a => {
      const d = new Date(a.startTime);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const total = monthAgs.length;
    const completed = monthAgs.filter(a => a.status === 'finalizado').length;
    const cancelled = monthAgs.filter(a => a.status === 'cancelado' || a.status === 'falta').length;
    const pending = monthAgs.filter(a => a.status === 'pendente' || a.status === 'confirmado').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    const procedures = new Set(profAgs.map(a => a.procedimento));
    const todayAgs = profAgs.filter(a => {
      const d = new Date(a.startTime);
      return d.toDateString() === now.toDateString();
    });

    return { ...p, total, completed, cancelled, pending, completionRate, procedures: procedures.size, todayCount: todayAgs.length, todayAgs, monthAgs };
  }).sort((a, b) => b.total - a.total);

  const selected = selectedProf ? profStats.find(p => p.id === selectedProf) : null;

  if (loading) return <div style={cardS}><div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Overview KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {[
          { icon: 'badge', color: '#6366f1', label: 'Profissionais', value: String(profissionais.length) },
          { icon: 'event', color: '#10b981', label: 'Atend. este Mês', value: String(profStats.reduce((s, p) => s + p.total, 0)) },
          { icon: 'check_circle', color: '#3b82f6', label: 'Finalizados', value: String(profStats.reduce((s, p) => s + p.completed, 0)) },
          { icon: 'today', color: '#f59e0b', label: 'Hoje', value: String(profStats.reduce((s, p) => s + p.todayCount, 0)) },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Professional cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {profStats.map(p => {
          const isSelected = selectedProf === p.id;
          return (
            <div key={p.id} onClick={() => setSelectedProf(isSelected ? null : p.id)}
              style={{
                background: 'var(--card-bg)', borderRadius: 20, border: isSelected ? `2px solid ${p.color}` : '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}>
              <div style={{ height: 4, background: p.color }} />
              <div style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.88rem' }}>
                    {p.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>{p.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.specialty} • {p.unit}</div>
                  </div>
                  {p.todayCount > 0 && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>{p.todayCount} hoje</span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#6366f1' }}>{p.total}</div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>AGENDA</div>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>{p.completed}</div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>FEITOS</div>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: p.completionRate >= 70 ? '#10b981' : '#f59e0b' }}>{p.completionRate.toFixed(0)}%</div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>TAXA</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded detail */}
      {selected && (
        <div style={cardS}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: selected.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.82rem' }}>
              {selected.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 900 }}>{selected.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Agenda do dia • {now.toLocaleDateString('pt-BR')}</div>
            </div>
          </div>

          {selected.todayAgs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>event_available</span>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Sem atendimentos hoje</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selected.todayAgs.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(a => {
                const start = new Date(a.startTime);
                const end = new Date(a.endTime);
                const statusColors: Record<string, string> = { pendente: '#f59e0b', confirmado: '#3b82f6', em_atendimento: '#6366f1', finalizado: '#10b981', falta: '#ef4444', cancelado: '#94a3b8' };
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', minWidth: 90 }}>
                      {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{a.clientName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.procedimento}</div>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${statusColors[a.status] || '#94a3b8'}15`, color: statusColors[a.status] || '#94a3b8' }}>
                      {a.status.replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
