import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthFromRequest } from '@/lib/auth'

// GET /api/atendimentos/[id] — busca atendimento completo com ficha
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await context.params

    const atendimento = await prisma.atendimento.findUnique({
      where: { id },
      include: { fichaCorporal: true },
    })

    if (!atendimento) {
      return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 })
    }

    return NextResponse.json(atendimento)
  } catch (error) {
    console.error('[GET /api/atendimentos/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PUT /api/atendimentos/[id] — atualiza atendimento e/ou ficha corporal
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await context.params
    const body = await req.json()
    const { fichaCorporal, ...atendimentoData } = body

    // Campos permitidos no Atendimento
    const atendimentoUpdate: Record<string, unknown> = {}
    const allowedFields = ['status', 'timerSeconds', 'privacidade', 'profissionalId', 'profissionalName']
    for (const field of allowedFields) {
      if (field in atendimentoData) atendimentoUpdate[field] = atendimentoData[field]
    }

    const atendimento = await prisma.atendimento.update({
      where: { id },
      data: {
        ...atendimentoUpdate,
        // Se vier dados da ficha corporal, atualiza via upsert
        ...(fichaCorporal && {
          fichaCorporal: {
            upsert: {
              create: fichaCorporal,
              update: fichaCorporal,
            },
          },
        }),
      },
      include: { fichaCorporal: true },
    })

    return NextResponse.json(atendimento)
  } catch (error) {
    console.error('[PUT /api/atendimentos/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE /api/atendimentos/[id] — remove atendimento e ficha (cascade)
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await context.params

    await prisma.atendimento.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/atendimentos/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
