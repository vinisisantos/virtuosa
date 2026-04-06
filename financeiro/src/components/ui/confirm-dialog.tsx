'use client';
import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let globalShow: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

/**
 * Call this function anywhere to show a styled confirmation dialog.
 * Returns a Promise<boolean>.
 * 
 * Usage:
 *   const ok = await confirmDialog({ message: 'Remover colaborador?' });
 *   if (ok) { ... }
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (globalShow) return globalShow(options);
  // Fallback to native if provider not mounted
  return Promise.resolve(window.confirm(options.message));
}

const VARIANT_CONFIG = {
  danger: {
    icon: 'delete_forever',
    iconBg: 'rgba(239,68,68,0.1)',
    iconColor: '#ef4444',
    confirmBg: 'linear-gradient(135deg, #ef4444, #dc2626)',
    confirmShadow: '0 4px 14px rgba(239,68,68,0.3)',
  },
  warning: {
    icon: 'warning',
    iconBg: 'rgba(245,158,11,0.1)',
    iconColor: '#f59e0b',
    confirmBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
    confirmShadow: '0 4px 14px rgba(245,158,11,0.3)',
  },
  info: {
    icon: 'help',
    iconBg: 'rgba(59,130,246,0.1)',
    iconColor: '#3b82f6',
    confirmBg: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    confirmShadow: '0 4px 14px rgba(59,130,246,0.3)',
  },
};

/**
 * Mount this once in your root layout to enable confirmDialog() globally.
 */
export function ConfirmDialogProvider() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const show = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
      setClosing(false);
    });
  }, []);

  useEffect(() => {
    globalShow = show;
    return () => { globalShow = null; };
  }, [show]);

  const handleClose = useCallback((result: boolean) => {
    setClosing(true);
    setTimeout(() => {
      state?.resolve(result);
      setState(null);
      setClosing(false);
    }, 200);
  }, [state]);

  // Close on Escape
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false);
      if (e.key === 'Enter') handleClose(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, handleClose]);

  if (!mounted || !state) return null;

  const v = VARIANT_CONFIG[state.variant || 'danger'];

  return createPortal(
    <div
      onClick={() => handleClose(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: closing ? 'confirmOverlayOut 0.2s ease forwards' : 'confirmOverlayIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg, #fff)',
          borderRadius: 24,
          border: '1px solid var(--border, #e5e7eb)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: 400,
          padding: '32px 28px 24px',
          textAlign: 'center',
          animation: closing ? 'confirmModalOut 0.2s ease forwards' : 'confirmModalIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: v.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: v.iconColor }}>
            {v.icon}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 900,
          color: 'var(--text-main, #111)',
        }}>
          {state.title || 'Confirmar ação'}
        </h3>

        {/* Message */}
        <p style={{
          margin: '0 0 28px', fontSize: '0.9rem', fontWeight: 500,
          color: 'var(--text-muted, #666)', lineHeight: 1.5,
        }}>
          {state.message}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => handleClose(false)}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 14,
              border: '1px solid var(--border, #e5e7eb)',
              background: 'var(--bg, #f9fafb)',
              color: 'var(--text-main, #333)',
              fontWeight: 700, fontSize: '0.88rem',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border, #e5e7eb)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg, #f9fafb)'; }}
          >
            {state.cancelText || 'Cancelar'}
          </button>
          <button
            onClick={() => handleClose(true)}
            autoFocus
            style={{
              flex: 1, padding: '12px 0', borderRadius: 14,
              border: 'none',
              background: v.confirmBg,
              color: '#fff',
              fontWeight: 800, fontSize: '0.88rem',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: v.confirmShadow,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = v.confirmShadow.replace('0.3', '0.45'); }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = v.confirmShadow; }}
          >
            {state.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes confirmOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes confirmOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes confirmModalIn { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes confirmModalOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95) translateY(5px); } }
      `}</style>
    </div>,
    document.body
  );
}
