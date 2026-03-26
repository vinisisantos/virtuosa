'use client';

import { useState } from 'react';

interface PriceComparisonPanelProps {
    products: { productName: string; quantity: number }[];
    onClose: () => void;
}

const generateMLSearchUrl = (productName: string) => {
    const query = productName.replace(/\s+/g, '-');
    return `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}_OrderId_PRICE_NoIndex_True`;
};

export function PriceComparisonPanel({ products, onClose }: PriceComparisonPanelProps) {
    const [opening, setOpening] = useState<number | null>(null);

    const openAll = () => {
        products.forEach((p, idx) => {
            setTimeout(() => {
                window.open(generateMLSearchUrl(p.productName), '_blank');
            }, idx * 400); // Small delay to avoid popup blocker
        });
    };

    const openSingle = (index: number, productName: string) => {
        setOpening(index);
        window.open(generateMLSearchUrl(productName), '_blank');
        setTimeout(() => setOpening(null), 1000);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: 20,
        }} onClick={onClose}>
            <div style={{
                background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)', maxWidth: 600, width: '100%',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: '24px 28px 16px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: '#FFF159', color: '#333',
                        }}>
                            <span className="material-symbols-outlined">shopping_cart</span>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Cotar no Mercado Livre</h2>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {products.length} produto(s) · ordenados por menor preço
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                    }}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Products List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
                    {products.map((product, idx) => (
                        <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '14px 16px', background: 'var(--bg)',
                            border: '1px solid var(--border)', borderRadius: 14,
                            marginBottom: 10, transition: 'all 0.2s',
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: '#FFF159', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <span style={{ fontWeight: 800, fontSize: '0.8rem', color: '#333' }}>{idx + 1}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                    {product.productName}
                                </p>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    Quantidade: {product.quantity}
                                </p>
                            </div>
                            <button
                                onClick={() => openSingle(idx, product.productName)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', borderRadius: 10,
                                    background: opening === idx ? '#dcfce7' : 'var(--bg)',
                                    border: '1px solid var(--border)',
                                    color: opening === idx ? '#16a34a' : 'var(--text-main)',
                                    fontWeight: 700, fontSize: '0.8rem',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                    transition: 'all 0.2s', flexShrink: 0,
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                    {opening === idx ? 'check' : 'open_in_new'}
                                </span>
                                {opening === idx ? 'Aberto' : 'Buscar'}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 28px', borderTop: '1px solid var(--border)',
                    background: 'var(--bg)', flexShrink: 0,
                    display: 'flex', gap: 12,
                }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: '12px 20px', borderRadius: 12,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.88rem',
                        cursor: 'pointer', fontFamily: 'inherit',
                    }}>Fechar</button>
                    <button onClick={openAll} style={{
                        flex: 2, padding: '12px 20px', borderRadius: 12,
                        border: 'none', background: '#FFF159',
                        color: '#333', fontWeight: 800, fontSize: '0.88rem',
                        cursor: 'pointer', fontFamily: 'inherit',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
                        Abrir todos no Mercado Livre
                    </button>
                </div>
            </div>
        </div>
    );
}
