'use client';
import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';

/* ──────────── Types ──────────── */
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  icon?: string;
}

interface NotificationContextType {
  toast: (message: string, type?: Toast['type']) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}

/* ──────────── Toast Component ──────────── */
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setExiting(true); setTimeout(onRemove, 300); }, 3500);
    return () => clearTimeout(timer);
  }, [onRemove]);

  const config = {
    success: { icon: 'check_circle', gradient: 'linear-gradient(135deg, #10b981, #34d399)', iconColor: '#10b981', bg: 'rgba(16,185,129,0.08)' },
    error:   { icon: 'error', gradient: 'linear-gradient(135deg, #ef4444, #f87171)', iconColor: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    warning: { icon: 'warning', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', iconColor: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    info:    { icon: 'info', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)', iconColor: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  }[toast.type];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1)',
      minWidth: 300, maxWidth: 420,
      animation: exiting ? 'toastSlideOut 0.3s ease-in forwards' : 'toastSlideIn 0.3s ease-out',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Left accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: config.gradient, borderRadius: '16px 0 0 16px' }} />
      
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: config.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: config.iconColor }}>{config.icon}</span>
      </div>

      {/* Message */}
      <div style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>
        {toast.message}
      </div>

      {/* Close */}
      <button onClick={() => { setExiting(true); setTimeout(onRemove, 300); }} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6,
        display: 'flex', opacity: 0.5, transition: 'opacity 0.2s',
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>close</span>
      </button>
    </div>
  );
}

/* ──────────── Confirm Dialog ──────────── */
function ConfirmDialog({ options, onResolve }: { options: ConfirmOptions; onResolve: (result: boolean) => void }) {
  const variantConfig = {
    danger:  { icon: options.icon || 'delete_forever', iconBg: 'rgba(239,68,68,0.1)', iconColor: '#ef4444', btnGradient: 'linear-gradient(135deg, #ef4444, #f87171)' },
    warning: { icon: options.icon || 'warning', iconBg: 'rgba(245,158,11,0.1)', iconColor: '#f59e0b', btnGradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
    info:    { icon: options.icon || 'help', iconBg: 'rgba(99,102,241,0.1)', iconColor: '#6366f1', btnGradient: 'linear-gradient(135deg, #6366f1, #818cf8)' },
  }[options.variant || 'danger'];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16,
      animation: 'fadeIn 0.2s ease-out',
    }}
      onClick={e => { if (e.target === e.currentTarget) onResolve(false); }}
    >
      <div style={{
        background: 'var(--card-bg)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 400,
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)', border: '1px solid var(--border)',
        animation: 'fadeInScale 0.25s ease-out', textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: variantConfig.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: variantConfig.iconColor }}>{variantConfig.icon}</span>
        </div>

        {/* Title */}
        <h3 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: 8, color: 'var(--text-main)' }}>
          {options.title}
        </h3>

        {/* Message */}
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 28, fontWeight: 500 }}>
          {options.message}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => onResolve(false)} style={{
            flex: 1, padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.88rem',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; }}
          >
            {options.cancelText || 'Cancelar'}
          </button>
          <button onClick={() => onResolve(true)} style={{
            flex: 1, padding: '12px 20px', borderRadius: 12, border: 'none',
            background: variantConfig.btnGradient, color: '#fff', fontWeight: 700, fontSize: '0.88rem',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)'; }}
          >
            {options.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Provider ──────────── */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = String(++idRef.current);
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const handleConfirmResolve = useCallback((result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  }, [confirmState]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast container */}
      <div style={{
        position: 'fixed', top: 20, right: 20, zIndex: 3000,
        display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end',
      }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <ConfirmDialog options={confirmState.options} onResolve={handleConfirmResolve} />
      )}

      {/* Animations */}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(80px) scale(0.95); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toastSlideOut {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to { opacity: 0; transform: translateX(80px) scale(0.95); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </NotificationContext.Provider>
  );
}
