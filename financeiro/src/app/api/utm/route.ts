import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/utm — captura UTM params de landing page e cria/atualiza lead
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, phone, email, unit,
      utmSource, utmMedium, utmCampaign, utmContent, fbclid,
    } = body

    if (!name && !phone && !email) {
      return NextResponse.json({ error: 'Pelo menos nome, telefone ou email é obrigatório' }, { status: 400 })
    }

    // Try to find existing client by phone or email
    let existingClient = null

    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-11)
      existingClient = await prisma.client.findFirst({
        where: {
          OR: [
            { phone: { contains: cleanPhone } },
            { phone: { contains: phone } },
          ],
          isActive: true,
        },
      })
    }

    if (!existingClient && email) {
      existingClient = await prisma.client.findFirst({
        where: { email: email.toLowerCase(), isActive: true },
      })
    }

    let clientId: string

    if (existingClient) {
      // Update existing client with UTM data
      await prisma.client.update({
        where: { id: existingClient.id },
        data: {
          ...(utmSource   ? { utmSource }   : {}),
          ...(utmMedium   ? { utmMedium }   : {}),
          ...(utmCampaign ? { utmCampaign } : {}),
          ...(utmContent  ? { utmContent }  : {}),
          ...(fbclid      ? { fbclid }      : {}),
          source: existingClient.source || (utmSource === 'facebook' ? 'meta_ads' : utmSource || 'site'),
          tags: existingClient.tags?.includes('UTM')
            ? existingClient.tags
            : (existingClient.tags ? existingClient.tags + ',UTM' : 'UTM'),
        },
      })
      clientId = existingClient.id
    } else {
      // Create new client with UTM data
      const newClient = await prisma.client.create({
        data: {
          name: name || 'Lead via UTM',
          phone: phone || undefined,
          email: email?.toLowerCase() || undefined,
          unit: unit || 'SCS',
          source: utmSource === 'facebook' ? 'meta_ads' : utmSource || 'site',
          stage: 'entrada',
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          fbclid,
          tags: 'UTM',
        },
      })
      clientId = newClient.id

      // Create pipeline entry
      await prisma.salesPipeline.create({
        data: {
          clientId,
          clientName: name || 'Lead via UTM',
          stage: 'novo_lead',
          source: utmSource === 'facebook' ? 'meta_ads' : utmSource || 'site',
          unit: unit || 'SCS',
          notes: `UTM: source=${utmSource || '-'}, medium=${utmMedium || '-'}, campaign=${utmCampaign || '-'}`,
        },
      })
    }

    return NextResponse.json({ success: true, clientId }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/utm]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
