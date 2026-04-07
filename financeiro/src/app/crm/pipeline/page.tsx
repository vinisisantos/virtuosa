'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface PipelineEntry {
  id: string;
  clientId: string;
  clientName: string;
  stage: string;
  value: number;
  source: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  unit: string;
  notes: string | null;
  leadId: string | null;
  lostReason: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalLeads: number;
  activeCount: number;
  totalValue: number;
  closedCount: number;
  lostCount: number;
  conversionRate: number;
  byStage: Record<string, { count: number; value: number }>;
}

const STAGES = [
  { key: 'novo_lead', label: 'Novo Lead', icon: 'person_add', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
  { key: 'em_atendimento', label: 'Em Atendimento', icon: 'support_agent', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  { key: 'em_negociacao', label: 'Em Negociação', icon: 'handshake', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { key: 'fechado', label: 'Fechado', icon: 'check_circle', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  { key: 'perdido', label: 'Perdido', icon: 'cancel', color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)' },
];

const sourceIcons: Record<string, { icon: string; color: string; label: string }> = {
  meta_ads: { icon: 'campaign', color: '#3b82f6', label: 'Meta Ads' },
  whatsapp: { icon: 'chat', color: '#25d366', label: 'WhatsApp' },
  instagram: { icon: 'photo_camera', color: '#e1306c', label: 'Instagram' },
  indicacao: { icon: 'group', color: '#8b5cf6', label: 'Indicação' },
  google: { icon: 'search', color: '#4285f4', label: 'Google' },
  site: { icon: 'language', color: '#f59e0b', label: 'Site' },
};

export default function PipelinePage() {
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<PipelineEntry | null>(null);
  const [lostReason, setLostReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, statsRes] = await Promise.all([
        fetch('/api/pipeline'),
        fetch('/api/pipeline/stats'),
      ]);
      const entriesData = await entriesRes.json();
      const statsData = await statsRes.json();
      setEntries(Array.isArray(entriesData) ? entriesData : []);
      setStats(statsData);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const moveCard = async (entryId: string, newStage: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry || entry.stage === newStage) return;

    // If moving to "perdido", ask for reason
    if (newStage === 'perdido') {
      setEditModal(entry);
      return;
    }

    // Optimistic update
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, stage: newStage } : e));

    try {
      await fetch('/api/pipeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entryId, stage: newStage }),
      });
      toast(`✅ Movido para "${STAGES.find(s => s.key === newStage)?.label}"`, 'success');
      fetchData();
    } catch {
      toast('Erro ao mover', 'error');
      fetchData();
    }
  };

  const confirmLost = async () => {
    if (!editModal) return;
    try {
      await fetch('/api/pipeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editModal.id, stage: 'perdido', lostReason }),
      });
      toast('Oportunidade marcada como perdida', 'info');
      setEditModal(null);
      setLostReason('');
      fetchData();
    } catch {
      toast('Erro', 'error');
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Remover esta oportunidade do funil?')) return;
    try {
      await fetch(`/api/pipeline?id=${id}`, { method: 'DELETE' });
      toast('Removido', 'success');
      fetchData();
    } catch {
      toast('Erro', 'error');
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const fmtValue = (v: number) => v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '';

  const cardS: React.CSSProperties = {
    background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
  };

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader activePage="clientes" />
        <main style={{ flex: 1, padding: '0 20px 20px', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <section style={{ margin: '20px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #ff4db1)' }}>
                  <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>funnel_chart</span>
                </span>
                Funil de <span style={{ color: 'var(--primary)' }}>Vendas</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                Gerencie oportunidades e acompanhe conversões
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="/crm/leads" style={{ ...cardS, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', textDecoration: 'none', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3b82f6' }}>campaign</span>
                Leads Meta
              </a>
              <a href="/crm/whatsapp" style={{ ...cardS, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', textDecoration: 'none', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#25d366' }}>chat</span>
                Inbox
              </a>
            </div>
          </section>

          {/* KPIs */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Total Leads', value: stats.totalLeads, icon: 'people', color: '#6366f1' },
                { label: 'Ativos', value: stats.activeCount, icon: 'trending_up', color: '#10b981' },
                { label: 'Valor Potencial', value: fmtValue(stats.totalValue) || 'R$ 0', icon: 'payments', color: '#f59e0b' },
                { label: 'Fechados', value: stats.closedCount, icon: 'check_circle', color: '#8b5cf6' },
                { label: 'Conversão', value: `${stats.conversionRate}%`, icon: 'percent', color: '#3b82f6' },
              ].map(kpi => (
                <div key={kpi.label} style={{ ...cardS, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: kpi.color }}>{kpi.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{kpi.label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{kpi.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Kanban Board */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, animation: 'spin 1.5s linear infinite' }}>progress_activity</span>
              <p style={{ marginTop: 12 }}>Carregando funil...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flex: 1, overflowX: 'auto', paddingBottom: 20 }}>
              {STAGES.map(stage => {
                const stageEntries = entries.filter(e => e.stage === stage.key);
                const isOver = dragOverStage === stage.key;
                return (
                  <div
                    key={stage.key}
                    style={{
                      minWidth: 260, maxWidth: 300, flex: 1, display: 'flex', flexDirection: 'column',
                      borderRadius: 18, background: isOver ? 'rgba(230,0,126,0.04)' : 'var(--bg)',
                      border: `1px solid ${isOver ? 'var(--primary)' : 'var(--border)'}`,
                      transition: 'all 0.2s',
                    }}
                    onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key); }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverStage(null);
                      if (draggedId) moveCard(draggedId, stage.key);
                    }}
                  >
                    {/* Column header */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: stage.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>{stage.icon}</span>
                        </div>
                        <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{stage.label}</span>
                      </div>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 8,
                        background: `${stage.color}14`, color: stage.color,
                      }}>
                        {stageEntries.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 100 }}>
                      {stageEntries.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.75rem', opacity: 0.6 }}>
                          Nenhuma oportunidade
                        </div>
                      ) : (
                        stageEntries.map(entry => {
                          const src = sourceIcons[entry.source || ''];
                          return (
                            <div
                              key={entry.id}
                              draggable
                              onDragStart={() => setDraggedId(entry.id)}
                              onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }}
                              style={{
                                ...cardS, padding: '12px 14px', cursor: 'grab',
                                opacity: draggedId === entry.id ? 0.5 : 1,
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.3 }}>
                                  {entry.clientName}
                                </span>
                                <button onClick={() => deleteEntry(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>close</span>
                                </button>
                              </div>

                              {/* Value */}
                              {entry.value > 0 && (
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10b981', marginBottom: 6 }}>
                                  {fmtValue(entry.value)}
                                </div>
                              )}

                              {/* Tags */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                {src && (
                                  <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${src.color}10`, color: src.color, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 10 }}>{src.icon}</span>
                                    {src.label}
                                  </span>
                                )}
                                <span style={{ fontSize: '0.58rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-muted)' }}>
                                  {entry.unit}
                                </span>
                              </div>

                              {/* Footer */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {entry.assignedName ? (
                                    <>
                                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '0.5rem', color: '#fff', fontWeight: 800 }}>{entry.assignedName.charAt(0)}</span>
                                      </div>
                                      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>{entry.assignedName.split(' ')[0]}</span>
                                    </>
                                  ) : (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem responsável</span>
                                  )}
                                </div>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{fmtDate(entry.createdAt)}</span>
                              </div>

                              {entry.lostReason && (
                                <div style={{ marginTop: 6, fontSize: '0.68rem', color: '#ef4444', fontStyle: 'italic', padding: '4px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.06)' }}>
                                  {entry.lostReason}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lost Reason Modal */}
          {editModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
              onClick={() => { setEditModal(null); setLostReason(''); }}>
              <div onClick={e => e.stopPropagation()} style={{ ...cardS, padding: 28, maxWidth: 440, width: '100%', boxShadow: 'var(--shadow-lg)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#ef4444' }}>cancel</span>
                  Marcar como Perdido
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Por que a oportunidade com <strong>{editModal.clientName}</strong> foi perdida?
                </p>
                <textarea
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                  placeholder="Motivo da perda (opcional)..."
                  rows={3}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--bg)', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'none',
                    outline: 'none', color: 'var(--text-main)', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setEditModal(null); setLostReason(''); }}
                    style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)' }}>
                    Cancelar
                  </button>
                  <button onClick={confirmLost}
                    style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Confirmar Perda
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AuthGuard>
  );
}
