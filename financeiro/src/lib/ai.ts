/**
 * AI Helper — Gemini → Groq → Mistral Fallback Chain
 * 
 * Tenta Gemini primeiro. Se falhar, Groq. Se falhar, Mistral.
 * Retorna o texto da resposta da IA.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_RETRIES = 2;

/* ── Friendly error messages ── */
export function friendlyError(raw: string): string {
  if (raw.includes('429') || raw.includes('quota') || raw.includes('Too Many Requests')) {
    return 'Limite de uso da IA atingido. Aguarde alguns minutos e tente novamente.';
  }
  if (raw.includes('API_KEY') || raw.includes('401') || raw.includes('403')) {
    return 'Chave da API de IA inválida ou expirada.';
  }
  if (raw.includes('network') || raw.includes('ECONNREFUSED') || raw.includes('fetch')) {
    return 'Erro de conexão com a IA. Verifique sua internet.';
  }
  return `Erro ao processar: ${raw.substring(0, 200)}`;
}

/* ── Clean JSON from AI response ── */
export function cleanJsonResponse(text: string): string {
  let clean = text.trim();
  
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  clean = clean.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
  clean = clean.trim();
  
  // If it starts with { and ends with }, it's already JSON
  if (clean.startsWith('{') && clean.endsWith('}')) return clean;
  
  // Try to extract JSON object from surrounding text
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return clean.substring(firstBrace, lastBrace + 1);
  }
  
  return clean;
}

/* ── Gemini call ── */
async function callGemini(
  prompt: string, systemPrompt: string,
  imageData?: { base64: string; mimeType: string },
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 16384 } });

  const parts: any[] = [systemPrompt];
  if (imageData) {
    parts.push({ inlineData: { data: imageData.base64, mimeType: imageData.mimeType } });
  }
  parts.push(prompt);

  const result = await model.generateContent(parts);
  return result.response.text();
}

/* ── Groq call (OpenAI-compatible API) ── */
async function callGroq(
  prompt: string, systemPrompt: string,
  imageData?: { base64: string; mimeType: string },
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada.');

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (imageData) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
        { type: 'text', text: prompt },
      ],
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const modelName = 'meta-llama/llama-4-scout-17b-16e-instruct';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/* ── Mistral call (OpenAI-compatible API) ── */
async function callMistral(
  prompt: string, systemPrompt: string,
  imageData?: { base64: string; mimeType: string },
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY não configurada.');

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (imageData) {
    // Pixtral supports vision
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
        { type: 'text', text: prompt },
      ],
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const modelName = imageData ? 'pixtral-12b-2409' : 'mistral-small-latest';

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Mistral error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/* ═══════════════════════════════════════════════════
 *  Main Export: callAI with Gemini → Groq → Mistral fallback
 * ═══════════════════════════════════════════════════ */
export type AIProvider = 'gemini' | 'groq' | 'mistral';

export async function callAI(
  prompt: string,
  systemPrompt: string,
  imageData?: { base64: string; mimeType: string },
): Promise<{ text: string; provider: AIProvider }> {

  // 1) Try Gemini first
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const text = await callGemini(prompt, systemPrompt, imageData);
      return { text, provider: 'gemini' };
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('429') && attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      console.warn(`[AI] Gemini failed: ${msg.substring(0, 100)}. Falling back to Groq...`);
      break;
    }
  }

  // 2) Fallback to Groq
  try {
    const text = await callGroq(prompt, systemPrompt, imageData);
    return { text, provider: 'groq' };
  } catch (groqErr: any) {
    console.warn(`[AI] Groq failed: ${(groqErr.message || '').substring(0, 100)}. Falling back to Mistral...`);
  }

  // 3) Fallback to Mistral
  try {
    const text = await callMistral(prompt, systemPrompt, imageData);
    return { text, provider: 'mistral' };
  } catch (mistralErr: any) {
    throw new Error(friendlyError(mistralErr.message || 'Todos os provedores de IA falharam.'));
  }
}

/* ── Text-only shorthand ── */
export async function callAIText(prompt: string, systemPrompt: string) {
  return callAI(prompt, systemPrompt);
}

/* ── With image shorthand ── */
export async function callAIVision(
  prompt: string, systemPrompt: string,
  base64: string, mimeType: string,
) {
  return callAI(prompt, systemPrompt, { base64, mimeType });
}
