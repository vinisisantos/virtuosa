'use client';

import { useState, useEffect, useRef } from 'react';

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

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];

export function OrderModal({ order, onSave, onClose, defaultUnit }: OrderModalProps) {
    const defaultItem: OrderItemInput = { productName: '', quantity: '', urgency: 'Média', notes: '', unit: defaultUnit || 'SBC', unitPrice: '', totalPrice: '', sourceUrl: '', lastPriceField: 'unit' };
    const [scrapingIndex, setScrapingIndex] = useState<number | null>(null);
    const [items, setItems] = useState<OrderItemInput[]>([{ ...defaultItem }]);

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
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: 20 }} onClick={onClose}>
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
                                    <label style={labelS}>Link do Produto</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input type="url" value={item.sourceUrl} onChange={e => handleItemChange(index, 'sourceUrl', e.target.value)}
                                            placeholder="https://www.mercadolivre.com.br/..." style={{ ...inputStyle, flex: 1 }} onFocus={focusIn} onBlur={focusOut} />
                                        {item.sourceUrl && (
                                            <button type="button" disabled={scrapingIndex === index}
                                                onClick={async () => {
                                                    setScrapingIndex(index);
                                                    try {
                                                        const res = await fetch('/api/orders/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: item.sourceUrl }) });
                                                        const data = await res.json();
                                                        if (data.productName && data.productName !== 'Produto não identificado') {
                                                            handleItemChange(index, 'productName', data.productName);
                                                        }
                                                        if (data.price) {
                                                            const qty = parseInt(item.quantity) || 1;
                                                            handleItemChange(index, 'unitPrice', formatCurrency((data.price * 100).toFixed(0)));
                                                            const tp = data.price * qty;
                                                            handleItemChange(index, 'totalPrice', formatCurrency((tp * 100).toFixed(0)));
                                                        }
                                                    } catch {}
                                                    setScrapingIndex(null);
                                                }}
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
