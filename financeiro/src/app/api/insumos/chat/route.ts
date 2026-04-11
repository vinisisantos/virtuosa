import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { callAIText, friendlyError } from '@/lib/ai';

/* ── POST: Text-only chat with AI (Gemini → Groq fallback) ── */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt é obrigatório.' }, { status: 400 });
    }

    const systemPrompt = `Você é um assistente especializado em gestão de insumos, estética e compras para clínicas de estética. Responda de forma clara, concisa e útil em português (pt-BR). Se o usuário perguntar sobre algo fora do escopo de insumos, ajude da melhor forma possível.`;

    const { text, provider } = await callAIText(prompt, systemPrompt);
    return NextResponse.json({ response: text, provider });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyError(err.message || '') }, { status: 500 });
  }
}
