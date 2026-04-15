'use client';

import { useState, useEffect, useRef } from 'react';
import { useGlobalUnit } from '@/contexts/UnitContext';

export interface OrderData {
    id?: string;
    productName: string;
    quantity: number;
    urgency: string;
    status: string;
    notes?: string;
    unit?: string;
    unitPrice?: number;
    totalPrice?: number;
    sourceUrl?: string;
    batchNumber?: number;
    estimatedArrival?: string;
    createdAt?: string;
}

export interface OrderItemInput {
    productName: string;
    quantity: string;
    urgency: string;
    notes: string;
    unit: string;
    unitPrice: string;
    totalPrice: string;
    sourceUrl: string;
    lastPriceField: 'unit' | 'total';
}

interface OrderModalProps {
    order?: OrderData | null;
    onSave: (data: Omit<OrderData, 'id' | 'status'>[]) => void;
    onClose: () => void;
    defaultUnit?: string;
}

function formatCurrency(val: string): string {
    const digits = val.replace(/\D/g, '');
    if (!digits) return '';
    const num = parseInt(digits, 10) / 100;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCur(val: string): number {
    const digits = val.replace(/\D/g, '');
    return parseInt(digits, 10) / 100 || 0;
}

function parseHtmlForPrice(html: string): { price: number | null; name: string } {
    let price: number | null = null;
    let name = '';
    // og:title — "Product Name - R$ 39,97"
    const ogMatch = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (ogMatch) {
        const ogTitle = ogMatch[1];
        const namePrice = ogTitle.match(/^(.+?)\s*-\s*R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
        if (namePrice) {
            name = namePrice[1].trim();
            price = parseFloat(namePrice[2].replace(/\./g, '').replace(',', '.'));
        } else {
            name = ogTitle.replace(/\s*[-–|]\s*(Mercado Livre|Amazon|Shopee|Americanas).*$/i, '').trim();
        }
    }
    // andes-money-amount (ML)
    if (!price) {
        const fraction = html.match(/class="andes-money-amount__fraction"[^>]*>([0-9.]+)</);
        if (fraction) {
            const whole = fraction[1].replace(/\./g, '');
            const cents = html.match(/class="andes-money-amount__cents[^"]*"[^>]*>([0-9]+)</);
            price = parseFloat(`${whole}.${cents?.[1] || '00'}`);
        }
    }
    // JSON price
    if (!price) {
        const jp = html.match(/"price"\s*:\s*([0-9]+\.?[0-9]*)\s*[,}]/);
        if (jp) { const p = parseFloat(jp[1]); if (p > 0 && p < 1000000) price = p; }
    }
    // R$ price
    if (!price) {
        const brp = html.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
        if (brp) price = parseFloat(brp[1].replace(/\./g, '').replace(',', '.'));
    }
    // product:price:amount
    if (!price) {
        const pm = html.match(/property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/content=["']([^"']+)["'][^>]+property=["']product:price:amount["']/i);
        if (pm) price = parseFloat(pm[1].replace(/,/g, '.'));
    }
    return { price, name };
}

export function OrderModal({ order, onSave, onClose, defaultUnit }: OrderModalProps) {
    const { units: UNITS } = useGlobalUnit();
    const defaultItem: OrderItemInput = { productName: '', quantity: '', urgency: 'Média', notes: '', unit: defaultUnit || UNITS[0] || 'SBC', unitPrice: '', totalPrice: '', sourceUrl: '', lastPriceField: 'unit' };
    const [scrapingIndex, setScrapingIndex] = useState<number | null>(null);
    const [pricePrompt, setPricePrompt] = useState<{ itemIndex: number; foundName: string; value: string } | null>(null);
    const [items, setItems] = useState<OrderItemInput[]>([{ ...defaultItem }]);

    const confirmManualPrice = () => {
        if (!pricePrompt) return;
        const cleaned = pricePrompt.value.replace(/[^\d,.]/g, '').replace(',', '.');
        const p = parseFloat(cleaned);
        if (p > 0) {
            const qty = parseInt(items[pricePrompt.itemIndex]?.quantity) || 1;
            handleItemChange(pricePrompt.itemIndex, 'unitPrice', formatCurrency((p * 100).toFixed(0)));
            handleItemChange(pricePrompt.itemIndex, 'totalPrice', formatCurrency((p * qty * 100).toFixed(0)));
        }
        setPricePrompt(null);
    };

    // ─── Core scrape logic (shared between button click and paste) ───
    const scrapeAndFill = async (index: number, url: string, currentQty: string) => {
        if (!url || scrapingIndex === index) return;
        try { new URL(url); } catch { return; } // validate URL first

        setScrapingIndex(index);
        let foundName = '';
        let foundPrice: number | null = null;

        // STEP 1: Extract name from URL slug (instant)
        try {
            const u = new URL(url);
            const isMl = /mercadoli(vre|bre)\./i.test(u.hostname);
            const isAmazon = /amazon\./i.test(u.hostname);
            const segments = u.pathname.split('/').filter(s => s.length > 3);

            if (isMl) {
                const slug = segments.find(s =>
                    s !== 'p' && !/^ML[A-Z]-?\d+$/i.test(s) && s !== '_JM' && !s.startsWith('pdp_filters') && s.length > 5
                );
                if (slug) {
                    foundName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
                }
            } else if (isAmazon) {
                const slug = segments.find(s => s.length > 10 && !/^(dp|gp|ref|B0[A-Z0-9]+)$/i.test(s));
                if (slug) foundName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
            } else {
                const slug = segments.sort((a, b) => b.length - a.length)[0];
                if (slug) foundName = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
            }
        } catch {}

        // STEP 2: ML Public API (CORS-enabled, most reliable for ML)
        try {
            const u2 = new URL(url);
            if (/mercadoli(vre|bre)\./i.test(u2.hostname)) {
                let mlItemId: string | null = null;
                const pMatch = url.match(/\/p\/(ML[A-Z]\d+)/i);
                if (pMatch) mlItemId = pMatch[1].toUpperCase();
                if (!mlItemId) {
                    const pathMatch = url.match(/(ML[A-Z])-(\d{5,})/i)
                        || url.match(/(ML[A-Z])(\d{5,})/i);
                    if (pathMatch) mlItemId = `${pathMatch[1].toUpperCase()}${pathMatch[2]}`;
                }
                if (mlItemId) {
                    const apiRes = await fetch(`https://api.mercadolibre.com/items/${mlItemId}`, { signal: AbortSignal.timeout(6000) });
                    if (apiRes.ok) {
                        const mlItem = await apiRes.json();
                        if (mlItem.price) foundPrice = mlItem.price;
                        // ML API title is always more accurate than URL slug
                        if (mlItem.title && mlItem.title.length > 5) foundName = mlItem.title;
                    }
                }
            }
        } catch {}

        // STEP 3: Edge API
        if (!foundPrice) {
            try {
                const res = await fetch('/api/orders/scrape-edge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(12000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data.price) foundPrice = data.price;
                    if (data.productName && data.productName.length > 5 && !foundName) foundName = data.productName;
                }
            } catch {}
        }

        // STEP 4: CORS proxies
        if (!foundPrice) {
            const proxies = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
            ];
            for (const proxyUrl of proxies) {
                if (foundPrice) break;
                try {
                    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
                    if (!res.ok) continue;
                    const html = await res.text();
                    if (html.length < 5000 && !html.includes('og:title')) continue;
                    const extracted = parseHtmlForPrice(html);
                    if (extracted.price) foundPrice = extracted.price;
                    if (extracted.name && !foundName) foundName = extracted.name;
                } catch {}
            }
        }

        // STEP 5: Server API
        if (!foundPrice) {
            try {
                const res = await fetch('/api/orders/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(10000) });
                const data = await res.json();
                if (data.price) foundPrice = data.price;
                if (!foundName && data.productName && data.productName !== 'Produto não identificado') foundName = data.productName;
            } catch {}
        }

        // Apply results
        if (foundName) handleItemChange(index, 'productName', foundName);
        if (foundPrice) {
            const qty = parseInt(currentQty) || 1;
            handleItemChange(index, 'unitPrice', formatCurrency((foundPrice * 100).toFixed(0)));
            handleItemChange(index, 'totalPrice', formatCurrency((foundPrice * qty * 100).toFixed(0)));
        } else {
            setPricePrompt({ itemIndex: index, foundName: foundName || 'produto', value: '' });
        }

        setScrapingIndex(null);
    };

    useEffect(() => {
        if (order) {
            setItems([{
                productName: order.productName,
                quantity: order.quantity.toString(),
                urgency: order.urgency,
                notes: order.notes || '',
                unit: order.unit || defaultUnit || 'SBC',
                unitPrice: order.unitPrice ? order.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
                totalPrice: order.totalPrice ? order.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
                sourceUrl: order.sourceUrl || '',
                lastPriceField: 'unit',
            }]);
        }
    }, [order, defaultUnit]);

    // Product name suggestions
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState<Record<number, boolean>>({});
    const suggestionsRef = useRef<Record<number, HTMLDivElement | null>>({});

    useEffect(() => {
        fetch('/api/orders/suggestions')
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setSuggestions(data); })
            .catch(() => {});
    }, []);

    const getFilteredSuggestions = (query: string) => {
        if (!query || query.length < 1) return [];
        const q = query.toLowerCase();
        return suggestions.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q).slice(0, 6);
    };

    const handleItemChange = (index: number, field: keyof OrderItemInput, value: string) => {
        setItems(prev => {
            const newItems = [...prev];
            const item = { ...newItems[index], [field]: value };

            // Bidirectional price calculation
            const qty = parseInt(item.quantity) || 0;

            if (field === 'unitPrice') {
                item.lastPriceField = 'unit';
                if (qty > 0 && value) {
                    const up = parseCur(value);
                    const tp = up * qty;
                    item.totalPrice = tp > 0 ? formatCurrency((tp * 100).toFixed(0)) : '';
                }
            } else if (field === 'totalPrice') {
                item.lastPriceField = 'total';
                if (qty > 0 && value) {
                    const tp = parseCur(value);
                    const up = tp / qty;
                    item.unitPrice = up > 0 ? formatCurrency((up * 100).toFixed(0)) : '';
                }
            } else if (field === 'quantity') {
                const newQty = parseInt(value) || 0;
                if (newQty > 0) {
                    if (item.lastPriceField === 'unit' && item.unitPrice) {
                        const up = parseCur(item.unitPrice);
                        const tp = up * newQty;
                        item.totalPrice = tp > 0 ? formatCurrency((tp * 100).toFixed(0)) : '';
                    } else if (item.lastPriceField === 'total' && item.totalPrice) {
                        const tp = parseCur(item.totalPrice);
                        const up = tp / newQty;
                        item.unitPrice = up > 0 ? formatCurrency((up * 100).toFixed(0)) : '';
                    }
                }
            }

            newItems[index] = item;
            return newItems;
        });
    };

    const handleAddItem = () => setItems([...items, { ...defaultItem }]);
    const handleRemoveItem = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };

    const selectSuggestion = (index: number, name: string) => {
        handleItemChange(index, 'productName', name);
        setShowSuggestions(prev => ({ ...prev, [index]: false }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const isValid = items.every(item => item.productName && item.quantity && parseInt(item.quantity) > 0);
        if (!isValid) return;

        const formattedItems = items.map(item => ({
            productName: item.productName,
            quantity: parseInt(item.quantity, 10),
            urgency: item.urgency,
            notes: item.notes || undefined,
            unit: item.unit || undefined,
            unitPrice: item.unitPrice ? parseCur(item.unitPrice) : undefined,
            totalPrice: item.totalPrice ? parseCur(item.totalPrice) : undefined,
            sourceUrl: item.sourceUrl || undefined,
        }));

        onSave(formattedItems);
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)',
        border: '2px solid var(--border)', background: 'var(--bg)', fontWeight: 600,
        fontFamily: 'inherit', fontSize: '0.85rem', transition: 'var(--transition)', outline: 'none',
    };

    const labelS: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' };

    const focusIn = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px var(--primary-light)'; };
    const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; };

    const isAllValid = items.every(item => item.productName && item.quantity && parseInt(item.quantity) > 0);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: 20 }} onClick={pricePrompt ? undefined : onClose}>

            {/* ── Inline price-prompt mini-modal ── */}
            {pricePrompt && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 300,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                }} onClick={e => e.stopPropagation()}>
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: 18, padding: '28px 28px 24px',
                        maxWidth: 420, width: '92%', boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                        border: '1px solid var(--border)',
                        animation: 'slideUpFade 0.2s ease',
                    }}>
                        <style>{`@keyframes slideUpFade { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#f59e0b' }}>price_change</span>
                            </div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Preço não encontrado</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Informe o valor que aparece na página</div>
                            </div>
                        </div>

                        {/* Product name badge */}
                        <div style={{
                            background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
                            borderRadius: 10, padding: '10px 14px', marginBottom: 18,
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#10b981', flexShrink: 0, marginTop: 1 }}>check_circle</span>
                            <div>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 3 }}>Nome encontrado</div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>{pricePrompt.foundName}</div>
                            </div>
                        </div>

                        {/* Price input */}
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
                            Preço unitário (R$)
                        </label>
                        <div style={{ position: 'relative', marginBottom: 22 }}>
                            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)', fontSize: '0.9rem', pointerEvents: 'none' }}>R$</span>
                            <input
                                autoFocus
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={pricePrompt.value}
                                onChange={e => setPricePrompt(prev => prev ? { ...prev, value: e.target.value } : null)}
                                onKeyDown={e => { if (e.key === 'Enter') confirmManualPrice(); if (e.key === 'Escape') setPricePrompt(null); }}
                                style={{
                                    width: '100%', padding: '11px 14px 11px 44px',
                                    borderRadius: 10, border: '2px solid var(--primary)',
                                    background: 'var(--bg)', fontFamily: 'inherit',
                                    fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)',
                                    outline: 'none', boxSizing: 'border-box',
                                    boxShadow: '0 0 0 4px var(--primary-light)',
                                }}
                            />
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type="button" onClick={() => setPricePrompt(null)} style={{
                                flex: 1, padding: '10px 16px', borderRadius: 10, border: '2px solid var(--border)',
                                background: 'transparent', color: 'var(--text-muted)', fontFamily: 'inherit',
                                fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                            }}>Cancelar</button>
                            <button type="button" onClick={confirmManualPrice} style={{
                                flex: 2, padding: '10px 16px', borderRadius: 10, border: 'none',
                                background: 'var(--primary)', color: '#fff', fontFamily: 'inherit',
                                fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(230,0,126,0.3)',
                            }}>Confirmar preço</button>
                        </div>
                    </div>
                </div>
            )}
            <div style={{
                background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)', maxWidth: 800, width: '100%', padding: '28px 28px 24px 28px',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'var(--primary-light)', color: 'var(--primary)',
                        }}>
                            <span className="material-symbols-outlined">{order ? 'edit' : 'format_list_bulleted_add'}</span>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{order ? 'Editar Pedido' : 'Novos Pedidos em Lote'}</h2>
                            {!order && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>Adicione vários produtos com preços</p>}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ overflowY: 'auto', flex: 1, paddingRight: 8, margin: '0 -8px 16px -8px', padding: '0 8px' }}>
                        {items.map((item, index) => (
                            <div key={index} style={{
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16,
                                position: 'relative'
                            }}>
                                {/* Line Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Item {index + 1}
                                    </span>
                                    {!order && items.length > 1 && (
                                        <button type="button" onClick={() => handleRemoveItem(index)}
                                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '0.78rem', fontWeight: 700, gap: 4 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>Remover
                                        </button>
                                    )}
                                </div>

                                {/* Row 1: Product, Qty, Urgency, Unit */}
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                                    <div>
                                        <label style={labelS}>Produto *</label>
                                        <div style={{ position: 'relative' }}>
                                            <input type="text" value={item.productName}
                                                onChange={e => { handleItemChange(index, 'productName', e.target.value); setShowSuggestions(prev => ({ ...prev, [index]: true })); }}
                                                onFocus={e => { setShowSuggestions(prev => ({ ...prev, [index]: true })); focusIn(e); }}
                                                onBlur={e => { setTimeout(() => setShowSuggestions(prev => ({ ...prev, [index]: false })), 200); focusOut(e); }}
                                                placeholder="Ex: Seringa 5ml" required style={inputStyle} autoComplete="off"
                                            />
                                            {showSuggestions[index] && getFilteredSuggestions(item.productName).length > 0 && (
                                                <div ref={el => { suggestionsRef.current[index] = el; }}
                                                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--card-bg)', borderRadius: '0 0 12px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid var(--border)', borderTop: 'none', maxHeight: 180, overflowY: 'auto' }}>
                                                    {getFilteredSuggestions(item.productName).map((s, sIdx) => (
                                                        <div key={sIdx} onMouseDown={() => selectSuggestion(index, s)}
                                                            style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: sIdx < getFilteredSuggestions(item.productName).length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s' }}
                                                            onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                                                            onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>history</span>
                                                            {s}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelS}>Qtd *</label>
                                        <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                                            placeholder="10" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                                    </div>
                                    <div>
                                        <label style={labelS}>Urgência</label>
                                        <select value={item.urgency} onChange={e => handleItemChange(index, 'urgency', e.target.value)} style={{ ...inputStyle, height: 42 }} onFocus={focusIn as any} onBlur={focusOut as any}>
                                            <option value="Baixa">Baixa</option>
                                            <option value="Média">Média</option>
                                            <option value="Alta">Alta</option>
                                            <option value="Urgente">Urgente</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelS}>Unidade</label>
                                        <select value={item.unit} onChange={e => handleItemChange(index, 'unit', e.target.value)} style={{ ...inputStyle, height: 42 }} onFocus={focusIn as any} onBlur={focusOut as any}>
                                            {UNITS.map(u => <option key={u}>{u}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Row 2: Prices + Obs */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
                                    <div>
                                        <label style={labelS}>Preço Unit. (R$)</label>
                                        <input value={item.unitPrice} onChange={e => handleItemChange(index, 'unitPrice', formatCurrency(e.target.value))}
                                            inputMode="numeric" placeholder="0,00" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                                    </div>
                                    <div>
                                        <label style={labelS}>Preço Total (R$)</label>
                                        <input value={item.totalPrice} onChange={e => handleItemChange(index, 'totalPrice', formatCurrency(e.target.value))}
                                            inputMode="numeric" placeholder="0,00" style={{ ...inputStyle, color: parseCur(item.totalPrice) > 0 ? '#10b981' : undefined, fontWeight: 800 }} onFocus={focusIn} onBlur={focusOut} />
                                    </div>
                                    <div>
                                        <label style={labelS}>Observações</label>
                                        <input type="text" value={item.notes} onChange={e => handleItemChange(index, 'notes', e.target.value)}
                                            placeholder="Ex: uso da semana..." style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                                    </div>
                                </div>

                                {/* Row 3: Source URL */}
                                <div style={{ marginTop: 10 }}>
                                    <label style={labelS}>Link do Produto
                                        {scrapingIndex === index && (
                                            <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 600, color: '#3b82f6', textTransform: 'none', letterSpacing: 0 }}
                                            >⏳ Buscando informações...</span>
                                        )}
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            type="url"
                                            value={item.sourceUrl}
                                            placeholder="https://www.mercadolivre.com.br/... (cole o link para preencher automaticamente)"
                                            style={{ ...inputStyle, flex: 1 }}
                                            onFocus={focusIn}
                                            onBlur={focusOut}
                                            onChange={e => handleItemChange(index, 'sourceUrl', e.target.value)}
                                            onPaste={e => {
                                                // Get pasted text directly from clipboard event
                                                const pasted = e.clipboardData.getData('text').trim();
                                                if (!pasted) return;
                                                // Update field first (React will process onChange after paste)
                                                handleItemChange(index, 'sourceUrl', pasted);
                                                // Auto-trigger scrape after a short tick so state is set
                                                setTimeout(() => scrapeAndFill(index, pasted, items[index]?.quantity || '1'), 50);
                                            }}
                                        />
                                        {item.sourceUrl && (
                                            <button type="button" disabled={scrapingIndex === index}
                                                onClick={() => scrapeAndFill(index, item.sourceUrl, item.quantity)}
                                                style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: scrapingIndex === index ? 'var(--border)' : '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: scrapingIndex === index ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16, animation: scrapingIndex === index ? 'spin 1s linear infinite' : 'none' }}>
                                                    {scrapingIndex === index ? 'progress_activity' : 'download'}
                                                </span>
                                                {scrapingIndex === index ? 'Buscando...' : 'Auto-preencher'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {!order && (
                            <button type="button" onClick={handleAddItem}
                                style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', transition: '0.2s' }}
                                onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-main)'; }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
                                Adicionar nova linha
                            </button>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                        <button type="button" onClick={onClose} style={{
                            flex: 1, padding: '12px 20px', border: '2px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)',
                            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)', cursor: 'pointer',
                        }}>Cancelar</button>

                        <button type="submit" disabled={!isAllValid} style={{
                            flex: 2, padding: '12px 20px', border: 'none', borderRadius: 'var(--radius-md)',
                            background: !isAllValid ? 'var(--border)' : 'var(--primary)',
                            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                            color: !isAllValid ? 'var(--text-muted)' : 'white',
                            cursor: !isAllValid ? 'not-allowed' : 'pointer',
                            boxShadow: !isAllValid ? 'none' : '0 4px 12px rgba(230, 0, 126, 0.25)',
                        }}>
                            {order ? 'Salvar Alteração' : `Salvar ${items.length} pedido(s)`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
