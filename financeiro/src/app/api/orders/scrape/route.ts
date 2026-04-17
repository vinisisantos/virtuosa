import { NextRequest, NextResponse } from 'next/server';

/* POST /api/orders/scrape — Extract product name and price from a URL */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });

    // ─── Strategy 1: Mercado Livre (URL slug + price attempts) ───
    const mlResult = await tryMercadoLivre(url);
    if (mlResult) return NextResponse.json(mlResult);

    // ─── Strategy 2: Amazon ───
    const amazonResult = await tryAmazon(url);
    if (amazonResult) return NextResponse.json(amazonResult);

    // ─── Strategy 3: Generic HTML scraping ───
    const genericResult = await tryGenericScrape(url);
    if (genericResult) return NextResponse.json(genericResult);

    // ─── Fallback: extract from URL slug ───
    return NextResponse.json(extractFromUrlSlug(url));
  } catch (err: any) {
    console.error('Scrape error:', err);
    return NextResponse.json({
      error: err.message?.includes('timeout') ? 'Tempo esgotado ao acessar a URL' : 'Erro ao processar a URL',
    }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════════
   MERCADO LIVRE — Bulletproof extraction
   
   ML blocks server-side requests (returns captcha/redirect).
   The URL slug ALWAYS contains the product name, so we use that
   as the PRIMARY source (never fails). For price we try multiple
   fallback strategies.
   ═══════════════════════════════════════════════════════════ */
async function tryMercadoLivre(url: string): Promise<any | null> {
  const isMl = /mercadoli(vre|bre)\.(com\.br|com\.ar|com\.mx|com\.co|com|cl)/i.test(url);
  if (!isMl) return null;

  // ─── Step 1: ALWAYS extract product name from URL slug (100% reliable) ───
  const productName = extractMlProductNameFromUrl(url);

  // ─── Step 2: Extract item ID for price lookups ───
  const itemId = extractMlItemId(url);

  // ─── Step 3: Try to get price via multiple strategies ───
  let price: number | null = null;
  let imageUrl = '';

  // Strategy A: ML items API (direct listing)
  if (itemId) {
    const formats = [itemId, `${itemId.slice(0,3)}-${itemId.slice(3)}`];
    for (const fmt of formats) {
      if (price) break;
      try {
        const apiRes = await fetch(`https://api.mercadolibre.com/items/${fmt}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(4000),
        });
        if (apiRes.ok) {
          const item = await apiRes.json();
          if (item.price) price = item.price;
          if (item.thumbnail) imageUrl = item.thumbnail.replace(/-I\.jpg/, '-O.jpg');
        }
      } catch {}
    }
  }

  // Strategy A2: Catalog search by catalog_product_id (for /p/ URLs)
  const isCatalogUrl = /\/p\/(ML[A-Z]\d+)/i.test(url);
  if (!price && itemId && isCatalogUrl) {
    try {
      const catRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${itemId}&limit=3`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        const first = catData?.results?.[0];
        if (first?.price) price = first.price;
        if (first?.thumbnail) imageUrl = first.thumbnail.replace(/-I\.jpg/, '-O.jpg');
      }
    } catch {}
  }

  // Strategy A3: Name-based search on ML when price still not found
  if (!price && productName && productName.length > 5 && productName !== 'Produto Mercado Livre') {
    try {
      const q = encodeURIComponent(productName.slice(0, 80));
      const searchRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${q}&limit=5`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const prices: number[] = (searchData?.results || [])
          .map((r: any) => r.price)
          .filter((p: any) => typeof p === 'number' && p > 0);
        if (prices.length > 0) {
          prices.sort((a: number, b: number) => a - b);
          price = prices[Math.floor(prices.length / 2)]; // median price
        }
      }
    } catch {}
  }

  // Strategy B: Fetch HTML with MULTIPLE User-Agents
  // ML blocks cloud IPs but usually allows Googlebot for SEO indexing
  if (!price) {
    const userAgents = [
      // Googlebot — sites allow this for SEO indexing (most reliable)
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      // WhatsApp link preview bot — often whitelisted
      'WhatsApp/2.23.20.0',
      // TelegramBot — often whitelisted
      'TelegramBot (like TwitterBot)',
      // Chrome Desktop
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      // Chrome Mobile
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    ];

    // Also try the mobile version of the URL
    const urlsToTry = [url];
    try {
      const mobileUrl = url.replace('www.mercadolivre.com.br', 'm.mercadolivre.com.br');
      if (mobileUrl !== url) urlsToTry.push(mobileUrl);
    } catch {}

    for (const tryUrl of urlsToTry) {
      if (price) break;
      for (const ua of userAgents) {
        if (price) break;
        try {
          const res = await fetch(tryUrl, {
            headers: {
              'User-Agent': ua,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
              'Accept-Encoding': 'identity',
              'Referer': 'https://www.google.com/',
              'Cache-Control': 'no-cache',
            },
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
          });
          if (!res.ok) continue;
          const html = await res.text();

          // Parse price from og:title — "Product Name - R$ 39,97"
          const ogTitle = extractMeta(html, 'og:title');
          if (ogTitle) {
            const priceMatch = ogTitle.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
            if (priceMatch) {
              price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
            }
          }
          // Parse price from andes-money-amount (ML component)
          if (!price) {
            const fractionMatch = html.match(/class="andes-money-amount__fraction"[^>]*>([0-9.]+)</);
            if (fractionMatch) {
              const whole = fractionMatch[1].replace(/\./g, '');
              const centsMatch = html.match(/class="andes-money-amount__cents[^"]*"[^>]*>([0-9]+)</);
              price = parseFloat(`${whole}.${centsMatch?.[1] || '00'}`);
            }
          }
          // Parse price from embedded JSON (mode-based — pick most frequent)
          if (!price) {
            const allJsonPrices: number[] = [];
            const jpRegex = /"price"\s*:\s*([0-9]+\.?[0-9]*)\s*[,}]/g;
            let jpMatch;
            while ((jpMatch = jpRegex.exec(html)) !== null) {
              const p = parseFloat(jpMatch[1]);
              if (p > 0 && p < 1000000) allJsonPrices.push(p);
            }
            if (allJsonPrices.length > 0) {
              const freq = new Map<number, number>();
              for (const p of allJsonPrices) freq.set(p, (freq.get(p) || 0) + 1);
              price = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
            }
          }
          // Parse from JSON-LD structured data
          if (!price) {
            const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi);
            if (jsonLdBlocks) {
              for (const block of jsonLdBlocks) {
                try {
                  const json = block.replace(/<\/?script[^>]*>/gi, '');
                  const data = JSON.parse(json);
                  const offer = data?.offers?.price || data?.offers?.[0]?.price || data?.price;
                  if (offer) { const p = parseFloat(String(offer)); if (p > 0 && p < 1000000) { price = p; break; } }
                } catch {}
              }
            }
          }
          // Parse any R$ price in the page
          if (!price) {
            price = extractBrazilianPrice(html);
          }
          // Image
          if (!imageUrl) {
            imageUrl = extractMeta(html, 'og:image') || '';
          }
        } catch {}
      }
    }
  }

  return {
    productName,
    price,
    imageUrl,
    url,
    source: 'mercadolivre',
  };
}

/**
 * Extracts product name from ML URL slug.
 * ML URLs always follow the pattern:
 *   /product-name-slug/p/MLB12345678
 *   /MLB-12345678-product-name-slug
 *   /product-name-slug/_JM
 * The slug IS the product name with hyphens.
 */
function extractMlProductNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;

    // Split path into segments, filter empties
    const segments = path.split('/').filter(s => s.length > 0);

    // Find the product slug segment (longest non-ID segment)
    let bestSlug = '';
    for (const seg of segments) {
      // Skip segments that are just identifiers
      if (seg === 'p' || seg === 'up') continue;
      if (/^ML[A-Z][BU]?-?\d+$/i.test(seg)) continue;
      if (seg === '_JM') continue;
      if (seg.startsWith('pdp_filters')) continue;

      // This segment might be a product slug
      // ML slug format: words-separated-by-hyphens
      // Longer is better (the product name is always the longest segment)
      if (seg.length > bestSlug.length) {
        bestSlug = seg;
      }
    }

    if (bestSlug && bestSlug.length > 5) {
      // Convert slug to proper name
      let name = bestSlug
        .replace(/-/g, ' ')            // hyphens to spaces
        .replace(/\s+/g, ' ')          // normalize spaces
        .trim();

      // Capitalize first letter of each word
      name = name.replace(/\b\w/g, c => c.toUpperCase());

      // Remove trailing ML identifiers that might be in the slug
      name = name.replace(/\s+(Mlb|Mla|Mlm|Mlc|Mlbu)\s*\d+$/i, '').trim();

      if (name.length > 5) return name;
    }
  } catch {}

  return 'Produto Mercado Livre';
}

/**
 * Extracts ML item ID from URL (e.g., MLB25715684)
 */
function extractMlItemId(url: string): string | null {
  // Pattern: /p/MLB12345678
  const pMatch = url.match(/\/p\/(ML[A-Z]\d+)/i);
  if (pMatch) return pMatch[1].toUpperCase();

  // Pattern: /up/MLBU12345678 (variant listing)
  const upMatch = url.match(/\/up\/(MLBU?\d+)/i);
  if (upMatch) return upMatch[1].toUpperCase();

  // Pattern: MLB-12345678 or MLB12345678 in path
  const pathMatch = url.match(/(ML[A-Z])-?(\d{5,})/i);
  if (pathMatch) return `${pathMatch[1].toUpperCase()}${pathMatch[2]}`;

  return null;
}

/* ═══════════════════════════════════════════════════════════
   AMAZON
   ═══════════════════════════════════════════════════════════ */
async function tryAmazon(url: string): Promise<any | null> {
  const isAmazon = /amazon\.(com\.br|com|co\.uk|de|es|fr|it|ca)/i.test(url);
  if (!isAmazon) return null;

  try {
    const html = await fetchHtml(url);
    if (!html) return null;

    let productName = '';
    const titleSpan = html.match(/id="productTitle"[^>]*>([^<]+)/i);
    if (titleSpan) productName = titleSpan[1].trim();
    if (!productName) {
      const ogTitle = extractMeta(html, 'og:title');
      if (ogTitle) productName = ogTitle;
    }

    let price: number | null = null;
    const priceWhole = html.match(/class="a-price-whole"[^>]*>([0-9.]+)/);
    const priceFraction = html.match(/class="a-price-fraction"[^>]*>([0-9]+)/);
    if (priceWhole) {
      const whole = priceWhole[1].replace(/\./g, '');
      price = parseFloat(`${whole}.${priceFraction?.[1] || '00'}`);
    }
    if (!price) price = extractBrazilianPrice(html);

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

/* ═══════════════════════════════════════════════════════════
   GENERIC HTML SCRAPING
   ═══════════════════════════════════════════════════════════ */
async function tryGenericScrape(url: string): Promise<any | null> {
  try {
    const html = await fetchHtml(url);
    if (!html) return null;

    let productName = '';
    let price: number | null = null;

    // 1. og:title
    const ogTitle = extractMeta(html, 'og:title');
    if (ogTitle) productName = ogTitle;

    // 2. <title>
    if (!productName) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) productName = titleMatch[1].trim();
    }

    // 3. <h1>
    if (!productName) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) productName = h1Match[1].trim();
    }

    // Price: og:price / product:price:amount
    const ogPrice = extractMeta(html, 'product:price:amount') || extractMeta(html, 'og:price:amount');
    if (ogPrice) price = parseFloat(ogPrice.replace(/,/g, '.'));

    // Price: JSON-LD
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

    // Price: structured data attributes
    if (!price) {
      const pricePatterns = [
        /itemprop="price"[^>]*content="([^"]+)"/i,
        /data-price="([^"]+)"/i,
        /class="[^"]*price[^"]*"[^>]*>[^<]*R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i,
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

    // Price: generic BR price
    if (!price) price = extractBrazilianPrice(html);

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

/* ═══════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════ */

async function fetchHtml(url: string): Promise<string | null> {
  // Try multiple User-Agents, Googlebot first (most reliable for product pages)
  const userAgents = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'WhatsApp/2.23.20.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];
  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
          'Accept-Encoding': 'identity',
          'Referer': 'https://www.google.com/',
        },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Skip bot-detection / captcha pages
      if (html.length < 5000 && !html.includes('og:title')) continue;
      if (html.includes('ui-empty-state')) continue;
      return html;
    } catch {}
  }
  return null;
}

function extractMeta(html: string, property: string): string | null {
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m1 = html.match(r1);
  if (m1) return m1[1];
  const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i');
  const m2 = html.match(r2);
  if (m2) return m2[1];
  return null;
}

function extractBrazilianPrice(html: string): number | null {
  const allPrices: number[] = [];
  const regex = /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
    if (val > 0 && val < 1000000) allPrices.push(val);
  }
  return allPrices.length > 0 ? allPrices[0] : null;
}

function cleanProductName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s*[-–|·]\s*(Mercado Livre|MercadoLivre|Amazon|Americanas|Magazine Luiza|Magalu|Shopee|Casas Bahia|Submarino|Extra|Kabum|Pichau).*$/i, '')
    .replace(/\s*[-–|]\s*(Frete gr[áa]tis|Free shipping).*$/i, '')
    .replace(/\s*[-–|]\s*(Compre|Aproveite|Oferta|Promoção).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFromUrlSlug(url: string): any {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(p => p && p.length > 3);
    const slug = pathParts.sort((a, b) => b.length - a.length)[0];
    if (slug) {
      const name = slug
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\s+(P|Dp|Ref|Sku|Id)\s+[A-Z0-9]+$/i, '')
        .trim();
      if (name.length > 3) {
        return { productName: name, price: null, imageUrl: null, url, source: 'url-slug' };
      }
    }
  } catch {}
  return { productName: 'Produto não identificado', price: null, imageUrl: null, url, source: 'fallback' };
}
