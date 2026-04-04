'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ToastProvider } from '@/components/toast';
import { NotificationProvider } from '@/components/ui/notifications';
import { WhatsNew } from '@/components/whats-new';
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts';
import { UnitProvider } from '@/contexts/UnitContext';

const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

function InactivityGuard({ children }: { children: React.ReactNode }) {
    const timer = useRef<NodeJS.Timeout | null>(null);

    const logout = useCallback(() => {
        fetch('/api/auth/logout',{method:'POST'}).finally(() => {
            localStorage.removeItem('virtuosa_user');
            window.location.replace('/login.html');
        });
    }, []);

    const resetTimer = useCallback(() => {
        if (!localStorage.getItem('virtuosa_user')) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(logout, INACTIVITY_TIMEOUT);
    }, [logout]);

    useEffect(() => {
        if (!localStorage.getItem('virtuosa_user')) return;
        resetTimer();
        ACTIVITY_EVENTS.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
        return () => {
            ACTIVITY_EVENTS.forEach(e => document.removeEventListener(e, resetTimer));
            if (timer.current) clearTimeout(timer.current);
        };
    }, [resetTimer]);

    return <>{children}</>;
}

import { TourProvider } from '@/components/guided-tour';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <UnitProvider>
            <NotificationProvider>
                <ToastProvider>
                    <TourProvider>
                        <InactivityGuard>{children}</InactivityGuard>
                    </TourProvider>
                    <KeyboardShortcuts />
                    <WhatsNew />
                </ToastProvider>
            </NotificationProvider>
        </UnitProvider>
    );
}
