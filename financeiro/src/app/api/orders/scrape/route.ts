import { NextRequest, NextResponse } from 'next/server';

/* POST /api/orders/scrape — Extract product name and price from a URL */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return NextResponse.json({ error: 'Não foi possível acessar a URL' }, { status: 400 });

    const html = await res.text();

    let productName = '';
    let price: number | null = null;
    let imageUrl = '';

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitle = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+(?:property|name)="og:title"/i);
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);

    productName = (ogTitle?.[1] || h1Match?.[1] || titleMatch?.[1] || '').trim();
    // Clean up common suffixes
    productName = productName.replace(/\s*[-|]\s*(Mercado Livre|Amazon|Magazine Luiza|Shopee|Americanas|Casas Bahia).*$/i, '').trim();
    productName = productName.replace(/\s*[-|]\s*Frete grátis.*$/i, '').trim();

    // Extract price — Mercado Livre
    const mlPrice = html.match(/class="andes-money-amount__fraction"[^>]*>([0-9.]+)</)
      || html.match(/"price"\s*:\s*([0-9]+\.?[0-9]*)/);
    if (mlPrice) {
      const raw = mlPrice[1].replace(/\./g, '');
      const cents = html.match(/class="andes-money-amount__cents[^"]*"[^>]*>([0-9]+)</);
      price = parseFloat(raw + '.' + (cents?.[1] || '00'));
    }

    // Extract price — generic (JSON-LD, meta, og:price)
    if (!price) {
      const jsonLd = html.match(/"price"\s*:\s*"?([0-9]+\.?[0-9]*)"?/);
      const ogPrice = html.match(/<meta\s+(?:property|name)="product:price:amount"\s+content="([^"]+)"/i)
        || html.match(/content="([^"]+)"\s+(?:property|name)="product:price:amount"/i);
      const priceStr = ogPrice?.[1] || jsonLd?.[1];
      if (priceStr) price = parseFloat(priceStr.replace(/,/g, '.'));
    }

    // Extract price — Brazilian format (R$ 12.345,67)
    if (!price) {
      const brPrice = html.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
      if (brPrice) {
        price = parseFloat(brPrice[1].replace(/\./g, '').replace(',', '.'));
      }
    }

    // Extract image
    const ogImage = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+(?:property|name)="og:image"/i);
    if (ogImage) imageUrl = ogImage[1];

    return NextResponse.json({
      productName: productName || 'Produto não identificado',
      price: price || null,
      imageUrl: imageUrl || null,
      url,
    });
  } catch (err: any) {
    console.error('Scrape error:', err);
    return NextResponse.json({
      error: err.message?.includes('timeout') ? 'Tempo esgotado ao acessar a URL' : 'Erro ao processar a URL',
    }, { status: 500 });
  }
}
