import { NextRequest, NextResponse } from 'next/server';

// Use Edge Runtime — runs on CDN edge nodes with different IPs than serverless
export const runtime = 'edge';

/**
 * POST /api/orders/scrape-edge
 * Edge-based proxy that fetches ML pages from CDN edge nodes.
 * These IPs are typically NOT blocked by ML's bot detection
 * since they look like regular CDN traffic.
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    // Prioritize Googlebot and social bots (most likely whitelisted)
    const userAgents = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'WhatsApp/2.23.20.0',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    ];

    for (const ua of userAgents) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
            'Referer': 'https://www.google.com/',
          },
          redirect: 'follow',
        });

        if (!res.ok) continue;
        const html = await res.text();

        // Check if we got a real page (not bot detection / captcha)
        if (html.length < 5000 && !html.includes('og:title')) continue;
        if (html.includes('ui-empty-state')) continue;

        let price: number | null = null;
        let productName = '';

        // 1. product:price:amount (most reliable structured data)
        const pm = html.match(/property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/content=["']([^"']+)["'][^>]+property=["']product:price:amount["']/i);
        if (pm) {
          const p = parseFloat(pm[1].replace(/,/g, '.'));
          if (p > 0 && p < 1000000) price = p;
        }

        // 2. Extract from og:title
        const ogMatch = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
        if (ogMatch) {
          const ogTitle = ogMatch[1];
          const namePrice = ogTitle.match(/^(.+?)\s*-\s*R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
          if (namePrice) {
            productName = namePrice[1].trim();
            if (!price) price = parseFloat(namePrice[2].replace(/\./g, '').replace(',', '.'));
          } else {
            productName = ogTitle.replace(/\s*[-–|]\s*(Mercado Livre|Amazon|Shopee|Americanas).*$/i, '').trim();
          }
        }

        // 3. JSON "price" field (mode-based — pick most frequent value)
        if (!price) {
          const allPrices: number[] = [];
          const jpRegex = /"price"\s*:\s*([0-9]+\.?[0-9]*)\s*[,}]/g;
          let jpMatch;
          while ((jpMatch = jpRegex.exec(html)) !== null) {
            const p = parseFloat(jpMatch[1]);
            if (p > 0 && p < 1000000) allPrices.push(p);
          }
          if (allPrices.length > 0) {
            const freq = new Map<number, number>();
            for (const p of allPrices) freq.set(p, (freq.get(p) || 0) + 1);
            price = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
          }
        }

        // 4. andes-money-amount (ML component)
        if (!price) {
          const fraction = html.match(/class="andes-money-amount__fraction"[^>]*>([0-9.]+)</);
          if (fraction) {
            const whole = fraction[1].replace(/\./g, '');
            const cents = html.match(/class="andes-money-amount__cents[^"]*"[^>]*>([0-9]+)</);
            price = parseFloat(`${whole}.${cents?.[1] || '00'}`);
          }
        }

        // 5. JSON-LD structured data
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

        // 6. itemprop="price" or data-price
        if (!price) {
          const ipMatch = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/data-price=["']([^"']+)["']/i);
          if (ipMatch) {
            const p = parseFloat(ipMatch[1].replace(/\./g, '').replace(',', '.'));
            if (p > 0 && p < 1000000) price = p;
          }
        }

        // 7. R$ price (last resort)
        if (!price) {
          const brp = html.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
          if (brp) price = parseFloat(brp[1].replace(/\./g, '').replace(',', '.'));
        }

        if (price || productName) {
          return NextResponse.json({ productName, price, source: 'edge', ua: ua.slice(0, 20) });
        }
      } catch {}
    }

    return NextResponse.json({ productName: '', price: null, source: 'edge-failed' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Edge scrape error' }, { status: 500 });
  }
}
