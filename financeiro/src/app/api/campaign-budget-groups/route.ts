import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'

const selectBudgetGroup = {
  id: true,
  name: true,
  platform: true,
  unit: true,
  dailyBudget: true,
  rechargeAmount: true,
  rechargeIntervalDays: true,
  startDate: true,
  endDate: true,
  isActive: true,
  campaigns: {
    select: { id: true, name: true, status: true },
    orderBy: { name: 'asc' as const },
  },
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const unit = new URL(req.url).searchParams.get('unit') || undefined
    const groups = await prisma.campaignBudgetGroup.findMany({
      where: unit ? { unit } : undefined,
      select: selectBudgetGroup,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })
    return NextResponse.json(groups)
  } catch (error) {
    console.error('[GET /api/campaign-budget-groups]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const name = String(body.name || '').trim()
    const platform = String(body.platform || 'meta_ads')
    const unit = String(body.unit || '').trim()
    const dailyBudget = Number(body.dailyBudget)
    const rechargeAmount = body.rechargeAmount === '' || body.rechargeAmount == null
      ? null
      : Number(body.rechargeAmount)
    const rechargeIntervalDays = body.rechargeIntervalDays === '' || body.rechargeIntervalDays == null
      ? null
      : Number(body.rechargeIntervalDays)
    const startDate = String(body.startDate || '')
    const endDate = body.endDate ? String(body.endDate) : null
    const campaignIds: string[] = Array.isArray(body.campaignIds)
      ? [...new Set<string>(body.campaignIds.map((id: unknown) => String(id)))]
      : []

    if (!name || !unit || !startDate || !Number.isFinite(dailyBudget) || dailyBudget <= 0) {
      return NextResponse.json({ error: 'Informe nome, unidade, data inicial e orçamento diário válido.' }, { status: 400 })
    }
    if (rechargeAmount != null && (!Number.isFinite(rechargeAmount) || rechargeAmount < 0)) {
      return NextResponse.json({ error: 'Valor da recarga inválido.' }, { status: 400 })
    }
    if (rechargeIntervalDays != null && (!Number.isInteger(rechargeIntervalDays) || rechargeIntervalDays <= 0)) {
      return NextResponse.json({ error: 'Intervalo da recarga inválido.' }, { status: 400 })
    }
    if (endDate && endDate < startDate) {
      return NextResponse.json({ error: 'A data final não pode ser anterior à inicial.' }, { status: 400 })
    }

    const campaigns = campaignIds.length > 0
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, unit: true, platform: true },
        })
      : []
    if (campaigns.length !== campaignIds.length || campaigns.some(campaign => campaign.unit !== unit || campaign.platform !== platform)) {
      return NextResponse.json({ error: 'As campanhas precisam pertencer à mesma unidade e plataforma do grupo.' }, { status: 400 })
    }

    const group = await prisma.$transaction(async tx => {
      const saved = body.id
        ? await tx.campaignBudgetGroup.update({
            where: { id: String(body.id) },
            data: {
              name, platform, unit, dailyBudget, rechargeAmount, rechargeIntervalDays,
              startDate, endDate, isActive: body.isActive !== false,
            },
          })
        : await tx.campaignBudgetGroup.upsert({
            where: { unit_name: { unit, name } },
            create: {
              name, platform, unit, dailyBudget, rechargeAmount, rechargeIntervalDays,
              startDate, endDate, isActive: body.isActive !== false,
              createdBy: auth.name || auth.email || 'Sistema',
            },
            update: {
              platform, dailyBudget, rechargeAmount, rechargeIntervalDays,
              startDate, endDate, isActive: body.isActive !== false,
            },
          })

      await tx.campaign.updateMany({ where: { budgetGroupId: saved.id }, data: { budgetGroupId: null } })
      if (campaignIds.length > 0) {
        await tx.campaign.updateMany({
          where: { id: { in: campaignIds } },
          data: { budgetGroupId: saved.id, budget: null },
        })
      }
      return tx.campaignBudgetGroup.findUniqueOrThrow({ where: { id: saved.id }, select: selectBudgetGroup })
    })

    return NextResponse.json(group)
  } catch (error) {
    console.error('[PUT /api/campaign-budget-groups]', error)
    return NextResponse.json({ error: 'Não foi possível salvar o orçamento compartilhado.' }, { status: 500 })
  }
}
