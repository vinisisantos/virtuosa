import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { monthlyEvolution, currentMonth, currentYear, totalRev, totalCost, margin } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Você é um analista financeiro especialista em clínicas de estética.

Com base nos dados abaixo, faça uma PREVISÃO de faturamento para o PRÓXIMO MÊS.

## Dados históricos (últimos meses):
${monthlyEvolution.map((m: { month: string; rev: number; cost: number }) => 
  `- ${m.month}: Faturamento R$ ${m.rev.toFixed(2)}, Custos R$ ${m.cost.toFixed(2)}`
).join('\n')}

## Mês atual (${currentMonth} ${currentYear}):
- Faturamento: R$ ${totalRev.toFixed(2)}
- Custos: R$ ${totalCost.toFixed(2)}
- Margem: ${margin.toFixed(1)}%

Responda EXATAMENTE neste formato JSON:
{
  "prediction": "R$ XX.XXX,XX",
  "confidence": "XX%",
  "analysis": "Sua análise aqui com tendências observadas, fatores de crescimento/queda, e recomendações. Use **negrito** para destacar números e insights importantes."
}

Responda APENAS o JSON, sem markdown code blocks.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ success: false, error: 'Invalid response format' });
    
    const forecast = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, forecast });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Forecast error' });
  }
}
