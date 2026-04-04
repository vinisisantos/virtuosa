'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type TabKey = 'agenda' | 'vendas' | 'financeiro' | 'dashboard' | 'more';

interface TabItem {
    key: TabKey;
    label: string;
    icon: string;
    href: string;
    matchPaths: string[];
}

const TABS: TabItem[] = [
    { key: 'agenda', label: 'Agenda', icon: 'calendar_month', href: '/agenda', matchPaths: ['/agenda'] },
    { key: 'vendas', label: 'Vendas', icon: 'point_of_sale', href: '/pacotes', matchPaths: ['/pacotes'] },
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard?tab=dashboard', matchPaths: ['/dashboard'] },
    { key: 'financeiro', label: 'Financeiro', icon: 'account_balance', href: '/pagamentos', matchPaths: ['/pagamentos', '/estoque', '/pedidos'] },
    { key: 'more', label: 'Mais', icon: 'menu', href: '#more', matchPaths: [] },
];

export function MobileTabBar() {
    const pathname = usePathname();
    const [isMobile, setIsMobile] = useState(false);
    const [showMore, setShowMore] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    if (!isMobile) return null;

    // Don't show on login page
    if (pathname === '/login' || pathname === '/login.html') return null;

    const activeTab = TABS.find(t => t.matchPaths.some(p => pathname.startsWith(p)))?.key
        || (pathname === '/' ? 'financeiro' : '');

    const moreItems = [
        { label: 'CRM', icon: 'view_kanban', href: '/clientes' },
        { label: 'Estoque', icon: 'inventory_2', href: '/estoque' },
        { label: 'Pedidos', icon: 'shopping_bag', href: '/pedidos' },
        { label: 'Contratos', icon: 'assignment', href: '/contratos' },
        { label: 'Cancelamentos', icon: 'cancel', href: '/cancelamentos' },
        { label: 'Perfil', icon: 'person', href: '/perfil' },
    ];

    return (
        <>
            {/* More menu overlay */}
            {showMore && (
                <div
                    className="mobile-more-overlay"
                    onClick={() => setShowMore(false)}
                >
                    <div
                        className="mobile-more-sheet"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mobile-more-handle" />
                        <div className="mobile-more-title">Mais opções</div>
                        <div className="mobile-more-grid">
                            {moreItems.map(item => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="mobile-more-item"
                                    onClick={() => setShowMore(false)}
                                >
                                    <span className="material-symbols-outlined mobile-more-icon">{item.icon}</span>
                                    <span className="mobile-more-label">{item.label}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab bar */}
            <nav className="mobile-tab-bar">
                {TABS.map(tab => {
                    const isActive = tab.key === activeTab;
                    if (tab.key === 'more') {
                        return (
                            <button
                                key={tab.key}
                                className={`mobile-tab-item ${showMore ? 'active' : ''}`}
                                onClick={() => setShowMore(!showMore)}
                            >
                                <span className="material-symbols-outlined mobile-tab-icon">
                                    {showMore ? 'close' : tab.icon}
                                </span>
                                <span className="mobile-tab-label">{tab.label}</span>
                            </button>
                        );
                    }

                    const isTabLink = tab.href.includes('?tab=');
                    if (isTabLink) {
                        return (
                            <a
                                key={tab.key}
                                href={tab.href}
                                className={`mobile-tab-item ${isActive ? 'active' : ''}`}
                                onClick={() => setShowMore(false)}
                            >
                                <span className="material-symbols-outlined mobile-tab-icon">{tab.icon}</span>
                                <span className="mobile-tab-label">{tab.label}</span>
                                {isActive && <span className="mobile-tab-indicator" />}
                            </a>
                        );
                    }

                    return (
                        <Link
                            key={tab.key}
                            href={tab.href}
                            className={`mobile-tab-item ${isActive ? 'active' : ''}`}
                            onClick={() => setShowMore(false)}
                        >
                            <span className="material-symbols-outlined mobile-tab-icon">{tab.icon}</span>
                            <span className="mobile-tab-label">{tab.label}</span>
                            {isActive && <span className="mobile-tab-indicator" />}
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
