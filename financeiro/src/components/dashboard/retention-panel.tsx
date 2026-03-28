'use client';
import React, { useState, useEffect } from 'react';
import { cardS, fmt } from '@/hooks/useDashboard';

interface AgendamentoData {
  id: string; clientName: string; clientPhone: string | null;
  procedimento: string; status: string; unit: string;
  startTime: string; profissionalId: string;
}

export function RetentionPanel() {
  const [agendamentos, setAgendamentos] = useState<AgendamentoData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agenda');
        const data = await res.json();
        setAgendamentos(data.agendamentos || []);
      } catch { }
      finally { setLoading(false); }
    })();
  }, []);

  // Analyze client retention
  const clientMap: Record<string, { name: string; visits: number; firstVisit: Date; lastVisit: Date; procedures: Set<string>; units: Set<string> }> = {};
  agendamentos.forEach(a => {
    const key = a.clientName.toLowerCase().trim();
    if (!clientMap[key]) clientMap[key] = { name: a.clientName, visits: 0, firstVisit: new Date(a.startTime), lastVisit: new Date(a.startTime), procedures: new Set(), units: new Set() };
    clientMap[key].visits++;
    const d = new Date(a.startTime);
    if (d < clientMap[key].firstVisit) clientMap[key].firstVisit = d;
    if (d > clientMap[key].lastVisit) clientMap[key].lastVisit = d;
    clientMap[key].procedures.add(a.procedimento);
    clientMap[key].units.add(a.unit);
  });

  const clients = Object.values(clientMap);
  const totalClients = clients.length;
  const returningClients = clients.filter(c => c.visits > 1);
  const newClients = clients.filter(c => c.visits === 1);
  const retentionRate = totalClients > 0 ? (returningClients.length / totalClients) * 100 : 0;

  // Inactive clients (no visit in last 60 days)
  const now = new Date();
  const inactiveClients = clients.filter(c => {
    const daysSince = (now.getTime() - c.lastVisit.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 60;
  });

  // Top returning clients
  const topClients = [...returningClients].sort((a, b) => b.visits - a.visits).slice(0, 10);

  // Average visits
  const avgVisits = totalClients > 0 ? clients.reduce((s, c) => s + c.visits, 0) / totalClients : 0;

  // This month stats
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthAgendamentos = agendamentos.filter(a => { const d = new Date(a.startTime); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; });
  const thisMonthUnique = new Set(thisMonthAgendamentos.map(a => a.clientName.toLowerCase().trim())).size;

  if (loading) return <div style={cardS}><div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando dados de retenção...</div></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {[
          { icon: 'groups', color: '#6366f1', label: 'Clientes Únicos', value: String(totalClients) },
          { icon: 'repeat', color: '#10b981', label: 'Retornaram', value: String(returningClients.length) },
          { icon: 'person_add', color: '#3b82f6', label: 'Primeira Vez', value: String(newClients.length) },
          { icon: 'trending_up', color: retentionRate >= 50 ? '#10b981' : '#f59e0b', label: 'Taxa Retenção', value: `${retentionRate.toFixed(1)}%` },
          { icon: 'person_off', color: '#ef4444', label: 'Inativos (+60d)', value: String(inactiveClients.length) },
          { icon: 'calendar_month', color: 'var(--primary)', label: 'Clientes este Mês', value: String(thisMonthUnique) },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardS, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Retention Gauge */}
      <div style={cardS}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#10b981' }}>loyalty</span>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Taxa de Retenção</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="10" />
              <circle cx="60" cy="60" r="50" fill="none"
                stroke={retentionRate >= 70 ? '#10b981' : retentionRate >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(retentionRate / 100) * 314.16} 314.16`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-main)' }}>{retentionRate.toFixed(0)}%</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              De <strong>{totalClients}</strong> clientes, <strong style={{ color: '#10b981' }}>{returningClients.length}</strong> retornaram pelo menos uma vez
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Média de visitas: <strong>{avgVisits.toFixed(1)}</strong> por cliente</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Top Returning Clients */}
        <div style={cardS}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>emoji_events</span>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>Clientes Mais Fiéis</h3>
          </div>
          {topClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Sem dados</div>
          ) : topClients.map((c, i) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < topClients.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ width: 24, fontSize: '0.78rem', fontWeight: 900, color: i < 3 ? '#f59e0b' : 'var(--text-muted)' }}>{i + 1}º</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.procedures.size} procedimentos • {[...c.units].join(', ')}</div>
              </div>
              <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#10b981' }}>{c.visits}x</span>
            </div>
          ))}
        </div>

        {/* Inactive Clients Alert */}
        <div style={cardS}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444' }}>person_off</span>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>Clientes Inativos (+60 dias)</h3>
          </div>
          {inactiveClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#10b981', opacity: 0.4 }}>check_circle</span>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#10b981', marginTop: 8 }}>Todos os clientes estão ativos!</p>
            </div>
          ) : inactiveClients.sort((a, b) => a.lastVisit.getTime() - b.lastVisit.getTime()).slice(0, 10).map((c, i) => {
            const days = Math.floor((now.getTime() - c.lastVisit.getTime()) / (1000 * 60 * 60 * 24));
            return (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 9 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Última visita: {c.lastVisit.toLocaleDateString('pt-BR')}</div>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: days > 90 ? '#ef4444' : '#f59e0b' }}>{days} dias</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
