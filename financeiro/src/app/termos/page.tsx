'use client';

import { AppHeader } from '@/components/app-header';
import { TermosClient } from './termos-client';
import AuthGuard from '@/components/auth-guard';

export default function TermosPage() {
    return (
        <AuthGuard allowedRoles={['ADMINISTRADOR', 'GERENTE', 'VENDEDOR', 'ESTETICISTA']} requiredPermission="dashboard">
            <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
                <AppHeader activePage="termos" />
                <main style={{ padding: '0 20px' }}>
                    <TermosClient />
                </main>
            </div>
        </AuthGuard>
    );
}
