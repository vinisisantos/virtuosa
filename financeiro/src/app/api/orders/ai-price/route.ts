import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/orders/ai-price
 * Uses Gemini AI with Google Search grounding to extract the price
 * of a product from any e-commerce URL.
 * 
 * This bypasses ML's bot-detection because Gemini uses Google's own
 * infrastructure to lookup the product information.
 */
export async function POST(req: NextRequest) {
  try {
    const { url, productName } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    // Build a precise prompt for price extraction
    const prompt = productName
      ? `Qual é o preço atual em reais (R$) do produto "${productName}" neste link: ${url} ?
Responda APENAS com o JSON abaixo, sem nenhum texto extra:
{"price": <número decimal do preço, ex: 174.34>, "productName": "<nome completo do produto>"}`
      : `Qual é o preço atual em reais (R$) do produto neste link: ${url} ?
Responda APENAS com o JSON abaixo, sem nenhum texto extra:
{"price": <número decimal do preço, ex: 174.34>, "productName": "<nome completo do produto>"}`;

    // Call Gemini API with Google Search grounding
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 256,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[ai-price] Gemini error:', geminiRes.status, errText);
      return NextResponse.json({ error: 'Gemini API error', status: geminiRes.status }, { status: 502 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || '')
      .join('') || '';

    console.log('[ai-price] Raw Gemini response:', rawText.slice(0, 300));

    // Try to extract JSON from the response
    let price: number | null = null;
    let extractedName = '';

    // 1. Try direct JSON parse
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*?"price"[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.price && typeof parsed.price === 'number' && parsed.price > 0) {
          price = parsed.price;
        }
        if (parsed.productName) extractedName = parsed.productName;
      }
    } catch {}

    // 2. Fallback: extract price from text
    if (!price) {
      // Look for R$ formatted price
      const brMatch = rawText.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
      if (brMatch) {
        price = parseFloat(brMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }

    if (!price) {
      // Look for decimal price
      const decMatch = rawText.match(/(\d{2,6})[.,](\d{2})/);
      if (decMatch) {
        const whole = decMatch[1].replace(/\./g, '');
        price = parseFloat(`${whole}.${decMatch[2]}`);
      }
    }

    return NextResponse.json({
      price,
      productName: extractedName || productName || '',
      source: 'gemini-ai',
      rawHint: price ? undefined : rawText.slice(0, 200),
    });
  } catch (err: any) {
    console.error('[ai-price] Error:', err);
    return NextResponse.json({ error: err.message || 'AI price extraction failed' }, { status: 500 });
  }
}
