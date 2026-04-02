import { NextRequest, NextResponse } from 'next/server';

/* POST /api/orders/scrape — Extract product name and price from a URL */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });

    // ─── Strategy 1: Mercado Livre — use public API ───
    const mlResult = await tryMercadoLivre(url);
    if (mlResult) return NextResponse.json(mlResult);

    // ─── Strategy 2: Amazon — parse HTML ───
    const amazonResult = await tryAmazon(url);
    if (amazonResult) return NextResponse.json(amazonResult);

    // ─── Strategy 3: Generic HTML scraping ───
    const genericResult = await tryGenericScrape(url);
    if (genericResult) return NextResponse.json(genericResult);

    // ─── Fallback: extract from URL slug ───
    const fallback = extractFromUrlSlug(url);
    return NextResponse.json(fallback);

  } catch (err: any) {
    console.error('Scrape error:', err);
    return NextResponse.json({
      error: err.message?.includes('timeout') ? 'Tempo esgotado ao acessar a URL' : 'Erro ao processar a URL',
    }, { status: 500 });
  }
}

/* ──────────────────── Mercado Livre ──────────────────── */
async function tryMercadoLivre(url: string): Promise<any | null> {
  // Check if it's a ML URL
  const isMl = /mercadoli(vre|bre)\.(com\.br|com\.ar|com\.mx|com\.co|com|cl)/i.test(url);
  if (!isMl) return null;

  try {
    const html = await fetchHtml(url);
    if (!html) return extractMlFromSlug(url);

    let productName = '';
    let price: number | null = null;

    // ─── Strategy A: og:title (most reliable for ML) ───
    // ML og:title format: "Papel Toalha 4000 Fls Interfolha Branco 100% Virgem Promo Supremo - R$ 39,97"
    const ogTitle = extractMeta(html, 'og:title');
    if (ogTitle) {
      // Split on " - R$" to separate name from price
      const priceInTitle = ogTitle.match(/^(.+?)\s*-\s*R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
      if (priceInTitle) {
        productName = priceInTitle[1].trim();
        price = parseFloat(priceInTitle[2].replace(/\./g, '').replace(',', '.'));
      } else {
        // No price in og:title, just use the full title
        productName = cleanProductName(ogTitle);
      }
    }

    // ─── Strategy B: h1.ui-pdp-title ───
    if (!productName) {
      const h1 = html.match(/class="ui-pdp-title"[^>]*>([^<]+)/i);
      if (h1) productName = h1[1].trim();
    }

    // ─── Strategy C: <title> tag ───
    if (!productName) {
      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleTag) {
        const raw = titleTag[1].trim();
        // ML title: "Product Name | MercadoLivre 📦" or "Product Name - Mercado Livre"
        productName = raw
          .replace(/\s*[|–-]\s*(Mercado\s*Li[vb]re|MercadoLi[vb]re).*$/i, '')
          .replace(/\s*📦.*$/, '')
          .trim();
      }
    }

    // ─── ML Price Extraction ───
    if (!price) {
      // ML uses andes-money-amount components
      const fractionMatch = html.match(/class="andes-money-amount__fraction"[^>]*>([0-9.]+)</);
      if (fractionMatch) {
        const whole = fractionMatch[1].replace(/\./g, '');
        const centsMatch = html.match(/class="andes-money-amount__cents[^"]*"[^>]*>([0-9]+)</);
        const cents = centsMatch?.[1] || '00';
        price = parseFloat(`${whole}.${cents}`);
      }
    }

    // ─── ML JSON data in page ───
    if (!price) {
      // Look for price in JSON data embedded in script tags
      const jsonPrice = html.match(/"price"\s*:\s*([0-9]+\.?[0-9]*)\s*[,}]/);
      if (jsonPrice) {
        const p = parseFloat(jsonPrice[1]);
        if (p > 0 && p < 1000000) price = p;
      }
    }

    // ─── Fallback: generic BR price ───
    if (!price) {
      price = extractBrazilianPrice(html);
    }

    const imageUrl = extractMeta(html, 'og:image') || '';

    if (!productName) {
      // Last resort: extract from URL slug
      return extractMlFromSlug(url);
    }

    return {
      productName: cleanProductName(productName),
      price,
      imageUrl,
      url,
      source: 'mercadolivre-html',
    };
  } catch (err) {
    console.error('ML scrape error:', err);
    return extractMlFromSlug(url);
  }
}

function extractMlFromSlug(url: string): any {
  try {
    const u = new URL(url);
    // ML URLs: /produto-nome-aqui/p/MLB12345678
    const pathParts = u.pathname.split('/').filter(Boolean);
    // The product slug is the first part (before /p/), and it's the longest
    const slugPart = pathParts.find(p => p !== 'p' && !p.match(/^ML[A-Z]\d+$/i) && p.length > 3);
    
    if (slugPart) {
      const name = slugPart
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
      
      if (name.length > 3 && !name.toLowerCase().includes('mercadolivre')) {
        return { productName: name, price: null, imageUrl: null, url, source: 'url-slug' };
      }
    }
  } catch {}
  return { productName: 'Produto Mercado Livre', price: null, imageUrl: null, url, source: 'fallback' };
}

/* ──────────────────── Amazon ──────────────────── */
async function tryAmazon(url: string): Promise<any | null> {
  const isAmazon = /amazon\.(com\.br|com|co\.uk|de|es|fr|it|ca)/i.test(url);
  if (!isAmazon) return null;

  try {
    const html = await fetchHtml(url);
    if (!html) return null;

    // Amazon product title
    let productName = '';
    const titleSpan = html.match(/id="productTitle"[^>]*>([^<]+)/i);
    if (titleSpan) productName = titleSpan[1].trim();
    if (!productName) {
      const ogTitle = extractMeta(html, 'og:title');
      if (ogTitle) productName = ogTitle;
    }

    // Amazon price
    let price: number | null = null;
    const priceWhole = html.match(/class="a-price-whole"[^>]*>([0-9.]+)/);
    const priceFraction = html.match(/class="a-price-fraction"[^>]*>([0-9]+)/);
    if (priceWhole) {
      const whole = priceWhole[1].replace(/\./g, '');
      const frac = priceFraction?.[1] || '00';
      price = parseFloat(`${whole}.${frac}`);
    }

    if (!price) {
      const brPrice = extractBrazilianPrice(html);
      if (brPrice) price = brPrice;
    }

    const imageUrl = extractMeta(html, 'og:image') || '';

    return {
      productName: cleanProductName(productName) || 'Produto Amazon',
      price,
      imageUrl,
      url,
      source: 'amazon',
    };
  } catch {
    return null;
  }
}

/* ──────────────────── Generic Scraping ──────────────────── */
async function tryGenericScrape(url: string): Promise<any | null> {
  try {
    const html = await fetchHtml(url);
    if (!html) return null;

    let productName = '';
    let price: number | null = null;

    // 1. Try og:title (most reliable for products)
    const ogTitle = extractMeta(html, 'og:title');
    if (ogTitle) productName = ogTitle;

    // 2. Try <title> tag
    if (!productName) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) productName = titleMatch[1].trim();
    }

    // 3. Try <h1>
    if (!productName) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) productName = h1Match[1].trim();
    }

    // Price extraction — multiple strategies
    // Strategy A: og:price or product:price:amount
    const ogPrice = extractMeta(html, 'product:price:amount') || extractMeta(html, 'og:price:amount');
    if (ogPrice) price = parseFloat(ogPrice.replace(/,/g, '.'));

    // Strategy B: JSON-LD structured data
    if (!price) {
      const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
      if (jsonLdBlocks) {
        for (const block of jsonLdBlocks) {
          const json = block.replace(/<\/?script[^>]*>/gi, '');
          try {
            const data = JSON.parse(json);
            const offer = data?.offers?.price || data?.offers?.[0]?.price || data?.price;
            if (offer) { price = parseFloat(String(offer)); break; }
          } catch {}
        }
      }
    }

    // Strategy C: Brazilian price format in specific elements
    if (!price) {
      // Look for price in common class names
      const pricePatterns = [
        /class="[^"]*price[^"]*"[^>]*>[^<]*R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i,
        /class="[^"]*valor[^"]*"[^>]*>[^<]*R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i,
        /itemprop="price"[^>]*content="([^"]+)"/i,
        /data-price="([^"]+)"/i,
      ];
      for (const pattern of pricePatterns) {
        const match = html.match(pattern);
        if (match) {
          const val = match[1].replace(/\./g, '').replace(',', '.');
          const parsed = parseFloat(val);
          if (parsed > 0 && parsed < 1000000) { price = parsed; break; }
        }
      }
    }

    // Strategy D: General Brazilian price
    if (!price) {
      price = extractBrazilianPrice(html);
    }

    const imageUrl = extractMeta(html, 'og:image') || '';

    if (!productName && !price) return null;

    return {
      productName: cleanProductName(productName) || 'Produto não identificado',
      price,
      imageUrl,
      url,
      source: 'generic',
    };
  } catch {
    return null;
  }
}

/* ──────────────────── Utilities ──────────────────── */

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractMeta(html: string, property: string): string | null {
  // Try property="X" content="Y"
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m1 = html.match(r1);
  if (m1) return m1[1];

  // Try content="Y" property="X"
  const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i');
  const m2 = html.match(r2);
  if (m2) return m2[1];

  return null;
}

function extractBrazilianPrice(html: string): number | null {
  // Find all BR prices in the page, prefer ones near "price" keywords
  const allPrices: number[] = [];
  const regex = /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
    if (val > 0 && val < 1000000) allPrices.push(val);
  }
  // Return the first reasonable price found (usually the main product price)
  return allPrices.length > 0 ? allPrices[0] : null;
}

function cleanProductName(name: string): string {
  if (!name) return '';
  return name
    // Remove common store name suffixes
    .replace(/\s*[-–|·]\s*(Mercado Livre|MercadoLivre|Amazon|Americanas|Magazine Luiza|Magalu|Shopee|Casas Bahia|Submarino|Extra|Ponto Frio|Kabum|Pichau).*$/i, '')
    // Remove "Frete grátis" and similar
    .replace(/\s*[-–|]\s*(Frete gr[áa]tis|Free shipping).*$/i, '')
    // Remove "Compre agora" type CTAs
    .replace(/\s*[-–|]\s*(Compre|Aproveite|Oferta|Promoção).*$/i, '')
    // Clean up extra spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFromUrlSlug(url: string): any {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(p => p && p.length > 3);
    
    // Find the longest path segment (usually the product slug)
    const slug = pathParts.sort((a, b) => b.length - a.length)[0];
    if (slug) {
      const name = slug
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\s+(P|Dp|Ref|Sku|Id)\s+[A-Z0-9]+$/i, '') // Remove IDs
        .trim();
      
      if (name.length > 3) {
        return { productName: name, price: null, imageUrl: null, url, source: 'url-slug' };
      }
    }
  } catch {}
  return { productName: 'Produto não identificado', price: null, imageUrl: null, url, source: 'fallback' };
}
