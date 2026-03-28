/**
 * Client-side utility to log user activities.
 * Fire-and-forget — does not block the UI.
 */
export async function logActivity(data: {
  action: 'login' | 'create' | 'update' | 'delete' | 'export' | 'import' | 'view';
  entityType: 'sale' | 'cost' | 'user' | 'order' | 'agendamento' | 'backup' | 'payroll' | 'termos' | 'cancelamento' | 'system';
  description: string;
  entityId?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_user') : null;
    const user = raw ? JSON.parse(raw) : null;
    
    fetch('/api/activity-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id,
        userName: user?.name || 'Sistema',
        unit: user?.unit,
        ...data,
      }),
    }).catch(() => {}); // Silent fail — never block UX
  } catch {
    // Silently ignore
  }
}
