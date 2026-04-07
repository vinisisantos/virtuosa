'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface MetaLead {
  id: string;
  leadgenId: string;
  formId: string | null;
  formName: string | null;
  adId: string | null;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  platform: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  clientId: string | null;
  status: string;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  novo: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Novo', icon: 'fiber_new' },
  processado: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Processado', icon: 'check_circle' },
  erro: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Erro', icon: 'error' },
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<MetaLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      const url = filter === 'all' ? '/api/leads' : `/api/leads?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const reprocess = async (leadId: string) => {
    setReprocessing(leadId);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (data.success) {
        toast('✅ Lead reprocessado com sucesso!', 'success');
        fetchLeads();
      } else {
        toast(`❌ Erro: ${data.error}`, 'error');
      }
    } catch {
      toast('Erro ao reprocessar', 'error');
    }
    setReprocessing(null);
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };
  const sectionS: React.CSSProperties = { background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '20px 24px' };

  const counts = {
    all: leads.length,
    novo: leads.filter(l => l.status === 'novo').length,
    processado: leads.filter(l => l.status === 'processado').length,
    erro: leads.filter(l => l.status === 'erro').length,
  };

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader activePage="clientes" />
        <main style={{ flex: 1, padding: '0 20px 20px' }}>
          {/* Header */}
          <section style={{ margin: '20px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
                  <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>campaign</span>
                </span>
                Leads <span style={{ color: '#3b82f6' }}>Meta</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                Leads capturados via Facebook/Instagram Lead Ads
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="/crm/pipeline" style={{ ...cardS, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>funnel_chart</span>
                Funil
              </a>
            </div>
          </section>

          {/* Status KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'all', label: 'Total', value: counts.all, color: '#6366f1', icon: 'people' },
              { key: 'novo', label: 'Novos', value: counts.novo, color: '#f59e0b', icon: 'fiber_new' },
              { key: 'processado', label: 'Processados', value: counts.processado, color: '#10b981', icon: 'check_circle' },
              { key: 'erro', label: 'Com Erro', value: counts.erro, color: '#ef4444', icon: 'error' },
            ].map(k => (
              <button key={k.key} onClick={() => setFilter(k.key)}
                style={{
                  ...cardS, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  outline: filter === k.key ? `2px solid ${k.color}` : 'none',
                  outlineOffset: -2, border: filter === k.key ? `1px solid ${k.color}` : '1px solid var(--border)',
                  fontFamily: 'inherit', textAlign: 'left',
                }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: `${k.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: k.color }}>{k.icon}</span>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k.label}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>{k.value}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Leads List */}
          <div style={sectionS}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, animation: 'spin 1.5s linear infinite' }}>progress_activity</span>
              </div>
            ) : leads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--text-muted)', opacity: 0.2 }}>campaign</span>
                <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.9rem' }}>Nenhum lead capturado ainda</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 4 }}>
                  Configure a Meta API em Configurações e conecte seus Lead Ads
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leads.map(lead => {
                  const st = statusConfig[lead.status] || statusConfig.novo;
                  return (
                    <div key={lead.id} style={{ ...cardS, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Avatar */}
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${st.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: st.color }}>{st.icon}</span>
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                            {lead.name || 'Sem nome'}
                          </span>
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                          {lead.platform && (
                            <span style={{ fontSize: '0.58rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: lead.platform === 'instagram' ? 'rgba(225,48,108,0.1)' : 'rgba(59,130,246,0.1)', color: lead.platform === 'instagram' ? '#e1306c' : '#3b82f6' }}>
                              {lead.platform}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          {lead.phone && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>phone</span>
                              {lead.phone}
                            </span>
                          )}
                          {lead.email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>email</span>
                              {lead.email}
                            </span>
                          )}
                          {lead.campaignName && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>campaign</span>
                              {lead.campaignName}
                            </span>
                          )}
                        </div>
                        {lead.errorMessage && (
                          <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#ef4444', fontStyle: 'italic' }}>
                            {lead.errorMessage}
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmtDate(lead.createdAt)}</div>
                        {lead.status === 'erro' && (
                          <button onClick={() => reprocess(lead.id)} disabled={reprocessing === lead.id}
                            style={{
                              marginTop: 6, padding: '5px 12px', borderRadius: 8, border: 'none',
                              background: reprocessing === lead.id ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                              color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: reprocessing === lead.id ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                            {reprocessing === lead.id ? 'Processando...' : 'Reprocessar'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AuthGuard>
  );
}
