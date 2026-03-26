'use client';

import { AppHeader } from '@/components/app-header';
import { OrdersClient } from './orders-client';
import AuthGuard from '@/components/auth-guard';

export default function PedidosPageWrapper() {
    return (
        <AuthGuard allowedRoles={['ADMINISTRADOR', 'GERENTE', 'VENDEDOR', 'ESTETICISTA']} requiredPermission="pedidos">
            <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
                <AppHeader activePage="pedidos" />

                {/* Main Content Area */}
                <main style={{ padding: '0 20px' }}>
                    <OrdersClient />
                </main>
            </div>
        </AuthGuard>
    );
}
