'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

/* ─── Types ─── */
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    duration: number;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
}

/* ─── Context ─── */
const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

/* ─── Single Toast Item ─── */
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setExiting(true);
            setTimeout(() => onRemove(toast.id), 300);
        }, toast.duration);
        return () => clearTimeout(timer);
    }, [toast, onRemove]);

    const handleDismiss = () => {
        setExiting(true);
        setTimeout(() => onRemove(toast.id), 300);
    };

    const icons: Record<ToastType, string> = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info',
    };

    const colors: Record<ToastType, string> = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#6366f1',
    };

    return (
        <div
            onClick={handleDismiss}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                background: 'rgba(255, 255, 255, 0.97)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
                border: `1px solid ${colors[toast.type]}22`,
                borderLeft: `4px solid ${colors[toast.type]}`,
                cursor: 'pointer',
                animation: exiting
                    ? 'toastSlideOut 0.3s ease-in forwards'
                    : 'toastSlideIn 0.3s ease-out',
                maxWidth: 380,
                width: '100%',
                fontFamily: 'Manrope, sans-serif',
                transition: 'opacity 0.3s ease',
            }}
        >
            <span
                className="material-symbols-outlined"
                style={{
                    fontSize: 22,
                    color: colors[toast.type],
                    flexShrink: 0,
                }}
            >
                {icons[toast.type]}
            </span>
            <span
                style={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    color: '#1a1a2e',
                    lineHeight: 1.4,
                    flex: 1,
                }}
            >
                {toast.message}
            </span>
            <span
                className="material-symbols-outlined"
                style={{
                    fontSize: 16,
                    color: '#9ca3af',
                    flexShrink: 0,
                    opacity: 0.6,
                }}
            >
                close
            </span>
        </div>
    );
}

/* ─── Provider ─── */
let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
        const id = ++nextId;
        setToasts(prev => [...prev, { id, message, type, duration }]);
    }, []);

    // Expose globally so non-React code can also use it
    useEffect(() => {
        (window as any).__virtuosaToast = showToast;
        return () => { delete (window as any).__virtuosaToast; };
    }, [showToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {mounted && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: 20,
                        right: 20,
                        zIndex: 99999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        pointerEvents: 'none',
                    }}
                >
                    {toasts.map(toast => (
                        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
                            <ToastItem toast={toast} onRemove={removeToast} />
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
}

/* ─── Global helper for non-React code ─── */
export function toast(message: string, type?: ToastType, duration?: number) {
    if (typeof window !== 'undefined' && (window as any).__virtuosaToast) {
        (window as any).__virtuosaToast(message, type, duration);
    }
}
