import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthFromRequest } from '@/lib/auth'

// GET /api/campaigns/manage — listar campanhas registradas
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const unit = searchParams.get('unit') || undefined
    const status = searchParams.get('status') || undefined
    const q = searchParams.get('q') || undefined // busca por nome

    const where: Record<string, unknown> = {}
    if (unit) where.unit = unit
    if (status) where.status = status
    if (q) where.name = { contains: q, mode: 'insensitive' }

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    })

    return NextResponse.json(campaigns)
  } catch (error) {
    console.error('[GET /api/campaigns/manage]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST /api/campaigns/manage — criar nova campanha (ou em todas as unidades)
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { name, platform, status, objective, budget, startDate, endDate, unit, notes, allUnits } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome da campanha é obrigatório' }, { status: 400 })
    }

    const ALL_UNITS = [ 'Osasco', 'SBC', 'SCS']

    const baseData = {
      name:      name.trim(),
      platform:  platform  || 'meta_ads',
      status:    status    || 'ativa',
      objective: objective || null,
      budget:    budget != null && budget !== '' ? parseFloat(String(budget)) : null,
      startDate: startDate || null,
      endDate:   endDate   || null,
      notes:     notes     || null,
      createdBy: auth.name || auth.email || 'Sistema',
    }

    if (allUnits) {
      // Create one campaign per unit
      await prisma.campaign.createMany({
        data: ALL_UNITS.map(u => ({ ...baseData, unit: u })),
        skipDuplicates: false,
      })
      return NextResponse.json({ success: true, count: ALL_UNITS.length, units: ALL_UNITS }, { status: 201 })
    }

    // Single unit
    const campaign = await prisma.campaign.create({
      data: { ...baseData, unit: unit || 'SCS' },
    })

    return NextResponse.json(campaign, { status: 201 })
  } catch (error) {
    console.error('[POST /api/campaigns/manage]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PUT /api/campaigns/manage — atualizar campanha existente
export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { id, ...data } = body

    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

    if (data.budget) data.budget = parseFloat(data.budget)

    const campaign = await prisma.campaign.update({
      where: { id },
      data,
    })

    return NextResponse.json(campaign)
  } catch (error) {
    console.error('[PUT /api/campaigns/manage]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE /api/campaigns/manage — excluir campanha
export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

    await prisma.campaign.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/campaigns/manage]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
