'use client';
import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useVisiblePolling } from '@/hooks/use-visible-polling';
import {
  CRM_NOTIFICATION_SNAPSHOT_EVENT,
  type CrmNotificationSnapshot,
  type CrmNotificationSnapshotItem,
} from '@/lib/crm-notification-snapshot';

type NotificationItem = CrmNotificationSnapshotItem;

const TYPE_COLORS: Record<string, string> = { alert: '#ef4444', reminder: '#f59e0b', info: '#3b82f6', success: '#10b981', warning: '#f97316' };

export function NotificationBell({ passive = false }: { passive?: boolean }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const notificationsInFlightRef = useRef(false);
  const panelId = `notification-panel-${useId().replace(/:/g, '')}`;

  const fetchNotifications = useCallback(async () => {
    if (notificationsInFlightRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    notificationsInFlightRef.current = true;
    try {
      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('virtuosa_user') || '{}') : {};
      const res = await fetch(`/api/notifications?userId=${user?.id || ''}&limit=15`);
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
    } finally {
      notificationsInFlightRef.current = false;
    }
  }, []);

  useVisiblePolling(fetchNotifications, 30000, { enabled: !passive });

  useEffect(() => {
    if (!passive) return;
    const applySnapshot = (event: Event) => {
      const snapshot = (event as CustomEvent<CrmNotificationSnapshot>).detail;
      if (!snapshot || !Array.isArray(snapshot.notifications)) return;
      setNotifications(snapshot.notifications);
      setUnreadCount(Number(snapshot.unreadCount || 0));
    };
    window.addEventListener(CRM_NOTIFICATION_SNAPSHOT_EVENT, applySnapshot);
    return () => window.removeEventListener(CRM_NOTIFICATION_SNAPSHOT_EVENT, applySnapshot);
  }, [passive]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => panelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const markRead = async (id: string) => {
    const response = await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => null);
    if (!response?.ok) return false;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    return true;
  };

  const markAllRead = async () => {
    const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('virtuosa_user') || '{}') : {};
    const response = await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAllRead: true, userId: user?.id }) }).catch(() => null);
    if (!response?.ok) return;
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const activateNotification = async (notification: NotificationItem) => {
    if (!notification.isRead) await markRead(notification.id);
    if (notification.link) window.location.assign(notification.link);
  };

  const getTimeAgo = (dateStr: string): string => {
    const d = new Date(dateStr); const now = new Date(); const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (mins < 1) return 'agora'; if (mins < 60) return `${mins}min`; const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`; return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Notificações${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setIsOpen(current => !current)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 6, borderRadius: 10, transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24, color: 'var(--text-muted)' }}>notifications</span>
        {unreadCount > 0 && (
          <span aria-hidden="true" style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.62rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card-bg)' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Notificações"
          tabIndex={-1}
          className="fixed left-3 right-3 top-[72px] z-[1000] max-h-[calc(100dvh-84px)] overflow-hidden rounded-[18px] border shadow-[0_20px_60px_rgba(0,0,0,0.3)] outline-none sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:max-h-[440px] sm:w-[min(360px,calc(100vw-24px))]"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>Notificações</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="min-h-11 rounded-lg px-2 text-xs font-bold sm:min-h-9" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontFamily: 'inherit' }}>Marcar todas como lidas</button>
              )}
              <button
                type="button"
                aria-label="Fechar notificações"
                onClick={() => {
                  setIsOpen(false);
                  window.requestAnimationFrame(() => triggerRef.current?.focus());
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg sm:h-9 sm:w-9"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 21 }}>close</span>
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-145px)] overflow-y-auto sm:max-h-[380px]">
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 40, opacity: 0.3 }}>notifications_off</span>
                <p style={{ fontWeight: 600, marginTop: 8, fontSize: '0.85rem' }}>Sem notificações</p>
              </div>
            ) : notifications.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => void activateNotification(n)}
                className="flex min-h-11 w-full gap-3 px-[18px] py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                style={{
                  cursor: 'pointer',
                  background: n.isRead ? 'transparent' : 'rgba(99,102,241,0.04)',
                  border: 0,
                  borderLeft: n.isRead ? 'none' : `3px solid ${TYPE_COLORS[n.type] || '#6366f1'}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = n.isRead ? 'transparent' : 'rgba(99,102,241,0.04)'}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${TYPE_COLORS[n.type] || '#6366f1'}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: TYPE_COLORS[n.type] || '#6366f1' }}>{n.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: n.isRead ? 600 : 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow:'hidden' }}>{n.message}</div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{getTimeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
