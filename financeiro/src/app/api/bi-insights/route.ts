import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { monthlyEvolution, totalRev, totalCost, margin, topProcedures, unitBreakdown } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' });

    // Fetch additional data for comprehensive analysis
    const [clients, agendamentos, payments] = await Promise.all([
      prisma.client.count(),
      prisma.agendamento.findMany({ where: { startTime: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }, select: { status: true } }),
      prisma.payment.findMany({ select: { status: true, amount: true, method: true } }),
    ]);

    const agendaStats = {
      total: agendamentos.length,
      completed: agendamentos.filter(a => a.status === 'finalizado').length,
      cancelled: agendamentos.filter(a => a.status === 'cancelado' || a.status === 'falta').length,
      pending: agendamentos.filter(a => a.status === 'pendente').length,
    };

    const paymentStats = {
      total: payments.length,
      received: payments.filter(p => p.status === 'pago').reduce((s, p) => s + p.amount, 0),
      pending: payments.filter(p => p.status === 'pendente').reduce((s, p) => s + p.amount, 0),
      overdue: payments.filter(p => p.status === 'atrasado').reduce((s, p) => s + p.amount, 0),
      methods: payments.reduce((acc: Record<string, number>, p) => { acc[p.method] = (acc[p.method] || 0) + 1; return acc; }, {}),
    };

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Você é um consultor de BI especialista em clínicas de estética brasileiras.

Analise TODOS os dados abaixo e gere insights estratégicos detalhados.

## Dados Financeiros:
- Faturamento: R$ ${totalRev?.toFixed(2) || '0.00'}
- Custos: R$ ${totalCost?.toFixed(2) || '0.00'}
- Margem: ${margin?.toFixed(1) || '0'}%

## Evolução Mensal:
${monthlyEvolution?.map((m: { month: string; rev: number; cost: number }) =>
  `- ${m.month}: Receita R$ ${m.rev.toFixed(2)}, Custos R$ ${m.cost.toFixed(2)}`
).join('\n') || 'Sem dados'}

## Top Procedimentos:
${topProcedures?.map((p: { name: string; count: number; revenue: number }) =>
  `- ${p.name}: ${p.count}x = R$ ${p.revenue.toFixed(2)}`
).join('\n') || 'Sem dados'}

## Unidades:
${unitBreakdown ? JSON.stringify(unitBreakdown) : 'Sem dados'}

## Clientes Cadastrados: ${clients}

## Agenda do Mês:
- Total: ${agendaStats.total}, Finalizados: ${agendaStats.completed}, Cancelados: ${agendaStats.cancelled}, Pendentes: ${agendaStats.pending}
- Taxa de conclusão: ${agendaStats.total > 0 ? ((agendaStats.completed / agendaStats.total) * 100).toFixed(1) : 0}%

## Pagamentos:
- Recebido: R$ ${paymentStats.received.toFixed(2)}
- Pendente: R$ ${paymentStats.pending.toFixed(2)}
- Atrasado: R$ ${paymentStats.overdue.toFixed(2)}
- Métodos: ${JSON.stringify(paymentStats.methods)}

Responda EXATAMENTE neste formato JSON:
{
  "score": 85,
  "scoreLabel": "Bom",
  "insights": [
    {"type": "trend", "icon": "📈", "title": "Título", "description": "Descrição detalhada", "priority": "high"},
    {"type": "alert", "icon": "⚠️", "title": "Título", "description": "Descrição", "priority": "medium"},
    {"type": "opportunity", "icon": "💡", "title": "Título", "description": "Descrição", "priority": "high"},
    {"type": "recommendation", "icon": "🎯", "title": "Título", "description": "Descrição", "priority": "low"}
  ],
  "kpis": [
    {"label": "Nome KPI", "value": "R$ XX.XXX", "trend": "up", "change": "+12%"},
    {"label": "Nome KPI", "value": "XX%", "trend": "down", "change": "-3%"}
  ],
  "summary": "Resumo executivo de 2-3 frases com **negrito** nos insights principais."
}

Gere pelo menos 6 insights e 4 KPIs relevantes. Use dados reais. Responda APENAS o JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ success: false, error: 'Invalid response format' });

    const biData = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, bi: biData });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'BI analysis error' });
  }
}
