'use client';
import React, { useState, useEffect } from 'react';
import { cardS } from '@/hooks/useDashboard';

interface WaitlistItem {
  id: string; clientName: string; clientPhone: string | null; procedimento: string;
  profissional: string | null; desiredDate: string; unit: string; notes: string | null; status: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  aguardando: { label: 'Aguardando', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  notificado: { label: 'Notificado', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  agendado: { label: 'Agendado', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  cancelado: { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
};

export function WaitlistPanel() {
  const [entries, setEntries] = useState<WaitlistItem[]>([]);
  const [stats, setStats] = useState({ waiting: 0, notified: 0, scheduled: 0 });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ clientName: '', clientPhone: '', procedimento: '', desiredDate: '', unit: 'Barueri', notes: '' });

  const fetchData = async () => {
    const res = await fetch('/api/waitlist');
    const data = await res.json();
    setEntries(data.entries || []);
    setStats(data.stats || {});
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addEntry = async () => {
    if (!form.clientName || !form.procedimento || !form.desiredDate) return;
    await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowAdd(false);
    setForm({ clientName: '', clientPhone: '', procedimento: '', desiredDate: '', unit: 'Barueri', notes: '' });
    fetchData();
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch('/api/waitlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    fetchData();
  };

  const notifyWhatsApp = (item: WaitlistItem) => {
    if (!item.clientPhone) return;
    const phone = item.clientPhone.replace(/\D/g, '');
    const phoneNum = phone.startsWith('55') ? phone : `55${phone}`;
    const date = new Date(item.desiredDate).toLocaleDateString('pt-BR');
    const msg = encodeURIComponent(`Olá ${item.clientName.split(' ')[0]}! 🎉\n\nAviso da Virtuosa Estética: temos um horário disponível para ${item.procedimento} próximo à data desejada (${date})!\n\nDeseja agendar? Responda esta mensagem. 💖`);
    window.open(`https://wa.me/${phoneNum}?text=${msg}`, '_blank');
    updateStatus(item.id, 'notificado');
  };

  const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.85rem', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, boxSizing: 'border-box' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header + KPIs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#6366f1' }}>hourglass_top</span>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Lista de Espera</h3>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Adicionar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[{ label: 'Aguardando', value: stats.waiting, color: '#f59e0b' }, { label: 'Notificados', value: stats.notified, color: '#3b82f6' }, { label: 'Agendados', value: stats.scheduled, color: '#10b981' }].map(s => (
          <div key={s.label} style={{ ...cardS, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showAdd && (
        <div style={{ ...cardS, padding: 16, border: '1px dashed rgba(99,102,241,0.3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Nome do cliente *" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} />
            <input placeholder="Telefone" value={form.clientPhone} onChange={e => setForm({ ...form, clientPhone: e.target.value })} style={inputS} />
            <input placeholder="Procedimento *" value={form.procedimento} onChange={e => setForm({ ...form, procedimento: e.target.value })} style={inputS} />
            <input type="date" value={form.desiredDate} onChange={e => setForm({ ...form, desiredDate: e.target.value })} style={inputS} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Cancelar</button>
            <button onClick={addEntry} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Salvar</button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Carregando...</div> : entries.length === 0 ? (
        <div style={{ ...cardS, textAlign: 'center', padding: '32px 0' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-muted)', opacity: 0.3 }}>event_available</span>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.85rem' }}>Lista de espera vazia</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(e => {
            const st = STATUS_MAP[e.status] || STATUS_MAP.aguardando;
            return (
              <div key={e.id} style={{ ...cardS, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800 }}>{e.clientName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{e.procedimento} • {new Date(e.desiredDate).toLocaleDateString('pt-BR')} • {e.unit}</div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: st.bg, color: st.color }}>{st.label}</span>
                {e.status === 'aguardando' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {e.clientPhone && <button onClick={() => notifyWhatsApp(e)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#25d366', color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>💬</button>}
                    <button onClick={() => updateStatus(e.id, 'agendado')} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(16,185,129,0.1)', color: '#10b981', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>✓</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
