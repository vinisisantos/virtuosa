'use client';
import React, { useState, useEffect, useRef } from 'react';

interface NotificationItem { id: string; type: string; title: string; message: string; icon: string; link: string | null; isRead: boolean; createdAt: string; }

const TYPE_COLORS: Record<string, string> = { alert: '#ef4444', reminder: '#f59e0b', info: '#3b82f6', success: '#10b981', warning: '#f97316' };

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('virtuosa_user') || '{}') : {};
      const res = await fetch(`/api/notifications?userId=${user?.id || ''}&limit=15`);
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch { }
  };

  useEffect(() => { fetchNotifications(); const iv = setInterval(fetchNotifications, 30000); return () => clearInterval(iv); }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = async (id: string) => {
    await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('virtuosa_user') || '{}') : {};
    await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAllRead: true, userId: user?.id }) }).catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const getTimeAgo = (dateStr: string): string => {
    const d = new Date(dateStr); const now = new Date(); const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (mins < 1) return 'agora'; if (mins < 60) return `${mins}min`; const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`; return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 6, borderRadius: 10, transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-muted)' }}>notifications</span>
        {unreadCount > 0 && (
          <div style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.62rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card-bg)' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 360, maxHeight: 440,
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 18,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)', zIndex: 1000, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>Notificações</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'inherit' }}>Marcar todas como lidas</button>
            )}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 380 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.3 }}>notifications_off</span>
                <p style={{ fontWeight: 600, marginTop: 8, fontSize: '0.85rem' }}>Sem notificações</p>
              </div>
            ) : notifications.map(n => (
              <div key={n.id} onClick={() => { if (!n.isRead) markRead(n.id); if (n.link) window.location.href = n.link; }}
                style={{
                  display: 'flex', gap: 12, padding: '12px 18px', cursor: 'pointer', transition: 'background 0.15s',
                  background: n.isRead ? 'transparent' : 'rgba(99,102,241,0.04)',
                  borderLeft: n.isRead ? 'none' : `3px solid ${TYPE_COLORS[n.type] || '#6366f1'}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = n.isRead ? 'transparent' : 'rgba(99,102,241,0.04)'}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${TYPE_COLORS[n.type] || '#6366f1'}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: TYPE_COLORS[n.type] || '#6366f1' }}>{n.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: n.isRead ? 600 : 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow:'hidden' }}>{n.message}</div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{getTimeAgo(n.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
