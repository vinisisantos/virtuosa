import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthFromRequest } from '@/lib/auth'

// GET /api/atendimentos — lista com filtros e paginação
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const unit        = searchParams.get('unit')       || undefined
    const status      = searchParams.get('status')     || undefined
    const clientName  = searchParams.get('clientName') || undefined
    const page        = parseInt(searchParams.get('page')  || '1')
    const limit       = parseInt(searchParams.get('limit') || '25')
    const skip        = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (unit)       where.unit       = unit
    if (status)     where.status     = status
    if (clientName) where.clientName = { contains: clientName, mode: 'insensitive' }

    const [atendimentos, total] = await Promise.all([
      prisma.atendimento.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { fichaCorporal: false },
      }),
      prisma.atendimento.count({ where }),
    ])

    return NextResponse.json({ atendimentos, total, page, limit })
  } catch (error) {
    console.error('[GET /api/atendimentos]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST /api/atendimentos — cria novo atendimento + ficha corporal vazia
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { clientId, clientName, profissionalId, profissionalName, unit } = body

    if (!clientId || !clientName || !unit) {
      return NextResponse.json({ error: 'clientId, clientName e unit são obrigatórios' }, { status: 400 })
    }

    const atendimento = await prisma.atendimento.create({
      data: {
        clientId,
        clientName,
        profissionalId:   profissionalId   || null,
        profissionalName: profissionalName || null,
        unit,
        status:       'rascunho',
        timerSeconds: 0,
        privacidade:  'privado',
        createdById:   auth.userId || null,
        createdByName: auth.name   || null,
        fichaCorporal: {
          create: {},
        },
      },
      include: { fichaCorporal: true },
    })

    return NextResponse.json(atendimento, { status: 201 })
  } catch (error) {
    console.error('[POST /api/atendimentos]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
