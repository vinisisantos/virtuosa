import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `Você é a assistente virtual da Virtuosa Clínica Estética.
Você ajuda a equipe administrativa com:
- Análise de relatórios de vendas (quando enviarem PDFs ou imagens)
- Perguntas sobre procedimentos estéticos
- Cálculos financeiros
- Dúvidas sobre o sistema

Quando receber um relatório de vendas (PDF ou imagem), extraia os dados em formato organizado:
- Nome do cliente, telefone, data da venda
- Procedimentos comprados (com quantidade e valor)
- Forma de pagamento, parcelas
- Descontos e total líquido

Responda sempre em português brasileiro, de forma profissional mas amigável.
Use emojis quando apropriado para tornar a conversa mais agradável.
Formate números monetários como R$ X.XXX,XX.`;

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const formData = await req.formData();
    const message = formData.get('message') as string || '';
    const file = formData.get('file') as File | null;
    const historyRaw = formData.get('history') as string || '[]';
    const selectedModel = formData.get('model') as string || 'gemini-2.5-flash';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada.' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = selectedModel === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    // Build conversation history
    let history: { role: string; parts: { text: string }[] }[] = [];
    try {
      const parsed = JSON.parse(historyRaw);
      history = parsed.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      }));
    } catch {}

    // Start chat with history
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: 'Olá' }] },
        { role: 'model', parts: [{ text: SYSTEM_PROMPT }] },
        ...history,
      ],
    });

    // Build message parts
    const parts: any[] = [];

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = file.type || 'application/pdf';
      parts.push({ inlineData: { data: base64, mimeType } });

      if (!message.trim()) {
        parts.push({ text: 'Analise este documento/imagem e extraia todos os dados relevantes.' });
      }
    }

    if (message.trim()) {
      parts.push({ text: message });
    }

    if (parts.length === 0) {
      return NextResponse.json({ error: 'Envie uma mensagem ou arquivo.' }, { status: 400 });
    }

    const result = await chat.sendMessage(parts);
    const responseText = result.response.text();

    return NextResponse.json({
      success: true,
      response: responseText,
    });
  } catch (err: any) {
    const errMsg = err.message || 'Erro desconhecido';
    console.error('[Chat API Error]:', errMsg);

    let userMessage = 'Erro ao processar. ';
    if (errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      userMessage = 'Cota da API esgotada. Aguarde alguns minutos e tente novamente.';
    } else if (errMsg.includes('too large') || errMsg.includes('size')) {
      userMessage = 'Arquivo muito grande. Tente um arquivo menor ou envie como imagem.';
    } else {
      userMessage += errMsg.substring(0, 200);
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
