import { NextRequest, NextResponse } from 'next/server';
import { callAI, callAIVision, cleanJsonResponse, friendlyError } from '@/lib/ai';

const SYSTEM_PROMPT = `Você é um assistente de ALTA PRECISÃO especializado em extrair dados de relatórios de vendas da clínica Virtuosa Estética.

ESTRUTURA DO RELATÓRIO "Vendas Detalhadas":
A tabela possui EXATAMENTE estas colunas, nesta ordem da esquerda para a direita:
1. Paciente — nome completo do cliente
2. Telefone — número com DDD, formato (11) XXXXX-XXXX
3. Data Venda — formato DD/MM/AAAA
4. Data de Nascimento — formato DD/MM/AAAA
5. Procedimentos — lista detalhada com quantidade e valor unitário (ex: "10x Drenagem Linfática: R$ 1600.00")
6. Vendedor — nome do vendedor ou "Estetica"
7. Tipo de Pagamento — "Link de Pagamento", "Cartão de Crédito", "Pix", "Várias Formas de Pagamento", etc.
8. Parcelas — número inteiro (1, 4, 6, 10, 11, 12, etc.)
9. Cortesia — valor em R$ (pode estar vazio)
10. Desc. R$ — valor do desconto em reais
11. Desc. % — percentual de desconto (ex: 54,54%, 71,59%)
12. Total Líquido — ⚠️ ÚLTIMA COLUNA, VALOR FINAL PAGO. Este valor NUNCA é zero se o cliente comprou algo. Exemplo: "R$ 1.500,00", "R$ 399,90", "R$ 1.900,00"

FORMATO DE SAÍDA — retorne EXCLUSIVAMENTE este JSON:
{
  "items": [
    {
      "date": "AAAA-MM-DD",
      "clientName": "Nome Completo",
      "phone": "(11) 99999-9999",
      "birthDate": "AAAA-MM-DD",
      "procedures": [
        {"name": "Nome do Procedimento", "qty": 10, "unitPrice": 160.00}
      ],
      "seller": "Nome do Vendedor",
      "paymentType": "Tipo de Pagamento",
      "installments": 10,
      "courtesy": 0.00,
      "discountValue": 2396.00,
      "discountPercent": 58.44,
      "totalLiquido": 1704.00
    }
  ],
  "summary": {
    "totalItems": 7,
    "totalLiquido": 12149.60,
    "totalDesconto": 15157.90
  }
}

⚠️ REGRAS CRÍTICAS — LEIA COM ATENÇÃO:

1. TODOS OS ITENS: Extraia ABSOLUTAMENTE CADA LINHA/CLIENTE da tabela. NÃO pule nenhum.

2. PRECISÃO TOTAL: Extraia EXATAMENTE os valores que estão no relatório. NÃO invente, NÃO calcule, NÃO modifique valores. Se o "Total Líquido" no relatório é "R$ 0,00", o totalLiquido deve ser 0.00. Se é "R$ 500,00", deve ser 500.00. Copie EXATAMENTE o que está escrito.

3. VALORES MONETÁRIOS: 
   - Remova "R$" e espaços
   - Ponto é separador de milhar: "3.780,00" = 3780.00
   - Vírgula é separador decimal: "1.500,00" = 1500.00
   - "399,90" = 399.90

4. DATAS: Converta DD/MM/AAAA para AAAA-MM-DD

5. PROCEDIMENTOS: Cada procedimento listado na célula deve ser um objeto separado no array. Ex: "10x Depilação Gluteos: R$ 890.00" → {"name":"Depilação Gluteos","qty":10,"unitPrice":89.00}. O unitPrice = valor total / qty.

6. NÃO INVENTE DADOS: Se um campo está vazio ou ilegível, use null ou 0. NUNCA fabrique um valor que não existe no relatório.

Retorne APENAS o JSON, sem texto extra, sem markdown, sem explicações.`;

// === Gemini REST API (direct, no SDK) — supports PDFs natively ===

async function callGeminiREST(base64: string, mimeType: string, prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: systemPrompt + '\n\n' + prompt },
          { inlineData: { data: base64, mimeType } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini REST ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const unit = formData.get('unit') as string || 'Barueri';

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'application/pdf';
    const isPdf = mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
    
    const userPrompt = `TAREFA: Extraia TODOS os clientes/vendas deste relatório "Vendas Detalhadas" da Virtuosa Estética.
    
INSTRUÇÕES:
- Leia CADA LINHA da tabela — cada linha é um cliente separado
- Extraia EXATAMENTE os valores que aparecem no relatório, sem inventar ou calcular
- Se o Total Líquido é R$ 0,00 no relatório, coloque 0.00 — NÃO invente um valor
- Extraia nome, telefone, data, procedimentos, pagamento, parcelas, desconto e total líquido
- Unidade: ${unit}
- Retorne APENAS JSON válido`;

    let aiText: string = '';
    let provider: string = '';

    if (isPdf) {
      // PDF: Gemini REST API directly (no SDK — the SDK fails with PDFs)
      console.log('[Extract] PDF → Gemini REST (single call)...');
      aiText = await callGeminiREST(base64, 'application/pdf', userPrompt, SYSTEM_PROMPT);
      provider = 'gemini-rest';
    } else {
      // Images: use existing callAIVision (already works)
      const result = await callAIVision(userPrompt, SYSTEM_PROMPT, base64, mimeType);
      aiText = result.text;
      provider = result.provider;
    }

    // Parse JSON response
    const cleaned = cleanJsonResponse(aiText);
    let data;
    try {
      data = JSON.parse(cleaned);
    } catch {
      console.error('[Extract] JSON parse failed. Raw:', cleaned.substring(0, 300));
      return NextResponse.json({
        error: `Não foi possível interpretar os dados extraídos. Provider: ${provider}. Resposta: ${cleaned.substring(0, 300)}`,
        raw: cleaned.substring(0, 800),
      }, { status: 422 });
    }

    // Validate and normalize items
    const items = (data.items || []).map((item: any) => {
      const procedures = (item.procedures || []).map((p: any) => ({
        name: p.name || '',
        qty: parseInt(p.qty) || 1,
        unitPrice: parseFloat(p.unitPrice) || 0,
      }));

      const totalLiquido = parseFloat(item.totalLiquido) || 0;
      const discountValue = parseFloat(item.discountValue) || 0;

      return {
        date: item.date || '',
        clientName: item.clientName || '',
        phone: item.phone || null,
        birthDate: item.birthDate || null,
        procedures,
        seller: item.seller || '',
        paymentType: item.paymentType || '',
        installments: parseInt(item.installments) || 1,
        courtesy: parseFloat(item.courtesy) || 0,
        discountValue,
        discountPercent: parseFloat(item.discountPercent) || 0,
        totalLiquido,
        unit,
      };
    });

    // Recalculate summary from actual items (don't trust AI summary)
    const summary = {
      totalItems: items.length,
      totalLiquido: items.reduce((s: number, i: any) => s + i.totalLiquido, 0),
      totalDesconto: items.reduce((s: number, i: any) => s + i.discountValue, 0),
    };

    return NextResponse.json({ success: true, items, summary, provider });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyError(err.message || 'Erro desconhecido.') }, { status: 500 });
  }
}
