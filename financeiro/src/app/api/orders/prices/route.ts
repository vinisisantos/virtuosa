import { NextRequest, NextResponse } from 'next/server';

interface MLProduct {
    title: string;
    price: number;
    permalink: string;
    thumbnail: string;
    condition: string;
    shipping_free: boolean;
    seller_name: string;
}

interface SearchResult {
    productName: string;
    quantity: number;
    results: MLProduct[];
    bestPrice: number | null;
    totalForQty: number | null;
}

// POST — Search Mercado Livre for multiple products
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { products } = body; // [{ productName, quantity }]

        if (!products || !Array.isArray(products) || products.length === 0) {
            return NextResponse.json({ error: 'Lista de produtos é obrigatória' }, { status: 400 });
        }

        const results: SearchResult[] = [];

        for (const product of products) {
            try {
                const query = encodeURIComponent(product.productName);
                const res = await fetch(
                    `https://api.mercadolibre.com/sites/MLB/search?q=${query}&sort=price_asc&limit=5`,
                    { next: { revalidate: 300 } } // Cache 5 min
                );

                if (!res.ok) {
                    results.push({
                        productName: product.productName,
                        quantity: product.quantity,
                        results: [],
                        bestPrice: null,
                        totalForQty: null,
                    });
                    continue;
                }

                const data = await res.json();
                const items: MLProduct[] = (data.results || []).slice(0, 5).map((item: any) => ({
                    title: item.title,
                    price: item.price,
                    permalink: item.permalink,
                    thumbnail: item.thumbnail,
                    condition: item.condition === 'new' ? 'Novo' : 'Usado',
                    shipping_free: item.shipping?.free_shipping || false,
                    seller_name: item.seller?.nickname || 'Vendedor',
                }));

                const bestPrice = items.length > 0 ? items[0].price : null;

                results.push({
                    productName: product.productName,
                    quantity: product.quantity,
                    results: items,
                    bestPrice,
                    totalForQty: bestPrice ? bestPrice * product.quantity : null,
                });
            } catch {
                results.push({
                    productName: product.productName,
                    quantity: product.quantity,
                    results: [],
                    bestPrice: null,
                    totalForQty: null,
                });
            }
        }

        const grandTotal = results.reduce((sum, r) => sum + (r.totalForQty || 0), 0);

        return NextResponse.json({ results, grandTotal });
    } catch (err) {
        console.error('ML search error:', err);
        return NextResponse.json({ error: 'Erro ao pesquisar preços' }, { status: 500 });
    }
}
