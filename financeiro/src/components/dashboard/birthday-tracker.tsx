'use client';
import React, { useState, useEffect } from 'react';
import { cardS } from '@/hooks/useDashboard';

interface Client {
  id: string; name: string; phone: string | null; birthdate: string | null; unit: string;
}

export function BirthdayTracker() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clients?limit=500').then(r => r.json()).then(data => {
      setClients(data.clients || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  // Find birthdays this month
  const birthdaysThisMonth = clients.filter(c => {
    if (!c.birthdate) return false;
    const bd = new Date(c.birthdate);
    return bd.getMonth() === currentMonth;
  }).map(c => {
    const bd = new Date(c.birthdate!);
    const day = bd.getDate();
    const age = now.getFullYear() - bd.getFullYear();
    const isPast = day < currentDay;
    const isToday = day === currentDay;
    return { ...c, day, age, isPast, isToday };
  }).sort((a, b) => a.day - b.day);

  const todayBirthdays = birthdaysThisMonth.filter(c => c.isToday);
  const upcomingBirthdays = birthdaysThisMonth.filter(c => !c.isPast && !c.isToday);
  const pastBirthdays = birthdaysThisMonth.filter(c => c.isPast);

  const sendWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const phoneNum = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const msg = encodeURIComponent(`🎂 Feliz aniversário, ${name.split(' ')[0]}! 🥳\n\nA equipe Virtuosa Estética deseja um dia incrível para você! 💖\n\nComo presente especial, temos uma surpresa esperando por você. Entre em contato para saber mais! ✨`);
    window.open(`https://wa.me/${phoneNum}?text=${msg}`, '_blank');
  };

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  if (loading) return <div style={cardS}><div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#f59e0b' }}>cake</span>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Aniversariantes de {MONTHS[currentMonth]}</h3>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>{birthdaysThisMonth.length}</span>
      </div>

      {/* Today */}
      {todayBirthdays.length > 0 && (
        <div style={{ ...cardS, border: '2px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>celebration</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f59e0b' }}>🎉 HOJE!</span>
          </div>
          {todayBirthdays.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #f59e0b, #eab308)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.82rem' }}>🎂</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>{c.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.age} anos • {c.unit}</div>
              </div>
              {c.phone && (
                <button onClick={() => sendWhatsApp(c.phone!, c.name)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: '0.82rem' }}>💬</span> Felicitar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upcoming */}
      {upcomingBirthdays.length > 0 && (
        <div style={cardS}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3b82f6' }}>upcoming</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Próximos</span>
          </div>
          {upcomingBirthdays.map(c => {
            const daysUntil = c.day - currentDay;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontWeight: 900, fontSize: '0.88rem' }}>{c.day}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Faz {c.age} anos • {c.unit}</div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: daysUntil <= 3 ? '#f59e0b' : '#3b82f6' }}>em {daysUntil}d</span>
                {c.phone && (
                  <button onClick={() => sendWhatsApp(c.phone!, c.name)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.06)', color: '#25d366', fontWeight: 700, cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'inherit' }}>💬</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Past this month */}
      {pastBirthdays.length > 0 && (
        <div style={{ ...cardS, opacity: 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>history</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>Já passaram ({pastBirthdays.length})</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pastBirthdays.map(c => (
              <span key={c.id} style={{ fontSize: '0.72rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--bg)', color: 'var(--text-muted)' }}>
                {c.day}/{currentMonth + 1} — {c.name.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      )}

      {birthdaysThisMonth.length === 0 && (
        <div style={{ ...cardS, textAlign: 'center', padding: '40px 0' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.3, color: 'var(--text-muted)' }}>sentiment_calm</span>
          <p style={{ fontSize: '0.85rem', marginTop: 8, color: 'var(--text-muted)' }}>Nenhum aniversariante cadastrado para {MONTHS[currentMonth]}</p>
        </div>
      )}
    </div>
  );
}
