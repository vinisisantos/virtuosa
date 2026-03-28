'use client';
import React, { useState, useEffect } from 'react';
import { cardS } from '@/hooks/useDashboard';

interface CommLog { id: string; clientName: string; clientPhone: string | null; channel: string; direction: string; message: string; type: string; unit: string; createdAt: string; }
interface Stats { total: number; whatsapp: number; phone: number; email: number; }

const CHANNEL_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  whatsapp: { icon: '💬', color: '#25d366', label: 'WhatsApp' },
  phone: { icon: '📞', color: '#3b82f6', label: 'Telefone' },
  email: { icon: '📧', color: '#6366f1', label: 'E-mail' },
  sms: { icon: '📱', color: '#f59e0b', label: 'SMS' },
};
const TYPE_LABELS: Record<string, string> = {
  manual: 'Manual', reminder: 'Lembrete', 'follow-up': 'Follow-up', nps: 'NPS', marketing: 'Marketing',
};

export function CommunicationHistory() {
  const [logs, setLogs] = useState<CommLog[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, whatsapp: 0, phone: 0, email: 0 });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ clientName: '', clientPhone: '', channel: 'whatsapp', direction: 'outgoing', message: '', type: 'manual', unit: 'Barueri' });

  const fetchData = async () => {
    const res = await fetch('/api/communications');
    const data = await res.json();
    setLogs(data.logs || []);
    setStats(data.stats || {});
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addLog = async () => {
    if (!form.clientName || !form.message) return;
    await fetch('/api/communications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowAdd(false);
    setForm({ clientName: '', clientPhone: '', channel: 'whatsapp', direction: 'outgoing', message: '', type: 'manual', unit: 'Barueri' });
    fetchData();
  };

  const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.85rem', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, boxSizing: 'border-box' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>💬</span>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Histórico de Comunicações</h3>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #25d366, #128c7e)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Registrar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Total', value: stats.total, color: '#6366f1', icon: '📊' },
          { label: 'WhatsApp', value: stats.whatsapp, color: '#25d366', icon: '💬' },
          { label: 'Telefone', value: stats.phone, color: '#3b82f6', icon: '📞' },
          { label: 'E-mail', value: stats.email, color: '#6366f1', icon: '📧' },
        ].map(s => (
          <div key={s.label} style={{ ...cardS, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>{s.icon} {s.label}</div>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showAdd && (
        <div style={{ ...cardS, padding: 16, border: '1px dashed rgba(37,211,102,0.3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Nome do cliente *" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} />
            <input placeholder="Telefone" value={form.clientPhone} onChange={e => setForm({ ...form, clientPhone: e.target.value })} style={inputS} />
            <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} style={inputS}>
              {Object.entries(CHANNEL_ICONS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputS}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div style={{ gridColumn: '1 / -1' }}>
              <input placeholder="Mensagem *" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} style={inputS} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Cancelar</button>
            <button onClick={addLog} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Salvar</button>
          </div>
        </div>
      )}

      {/* Log list */}
      {loading ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Carregando...</div> : logs.length === 0 ? (
        <div style={{ ...cardS, textAlign: 'center', padding: 32 }}>
          <span style={{ fontSize: 40, opacity: 0.3 }}>💬</span>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Nenhuma comunicação registrada</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {logs.map(l => {
            const ch = CHANNEL_ICONS[l.channel] || CHANNEL_ICONS.whatsapp;
            return (
              <div key={l.id} style={{ ...cardS, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.2rem' }}>{ch.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{l.clientName}</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: l.direction === 'outgoing' ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)', color: l.direction === 'outgoing' ? '#10b981' : '#3b82f6' }}>
                      {l.direction === 'outgoing' ? '↗ Enviado' : '↙ Recebido'}
                    </span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'var(--bg)', color: 'var(--text-muted)' }}>{TYPE_LABELS[l.type] || l.type}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.message}</div>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleDateString('pt-BR')} {new Date(l.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
