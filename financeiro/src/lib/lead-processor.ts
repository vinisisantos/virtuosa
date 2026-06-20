import { prisma } from '@/lib/db';
import { assignLeadToOperator } from '@/lib/lead-assigner';

interface LeadData {
  leadgenId: string;
  formId?: string;
  formName?: string;
  adId?: string;
  adName?: string;
  campaignId?: string;
  campaignName?: string;
  pageId?: string;
  platform?: string;
  name?: string;
  email?: string;
  phone?: string;
  rawData?: string;
  unit?: string;
}

/**
 * Fetch complete lead data from Meta Graph API.
 */
export async function fetchLeadDataFromMeta(
  leadgenId: string,
  accessToken: string
): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${accessToken}`
    );
    if (!res.ok) {
      console.error('[LeadProcessor] Graph API error:', await res.text());
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error('[LeadProcessor] Fetch error:', error);
    return null;
  }
}

/**
 * Normalize phone number to a consistent format.
 * Strips non-digits, ensures country code.
 */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  // Brazilian phone: add 55 if not present
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  if (digits.length < 10) return null;
  return '+' + digits;
}

/**
 * Process a lead: deduplicate, create/update client, create pipeline entry.
 */
export async function processLead(data: LeadData): Promise<{
  success: boolean;
  clientId?: string;
  pipelineId?: string;
  error?: string;
  isDuplicate?: boolean;
}> {
  const unit = data.unit || 'SCS';
  const phone = normalizePhone(data.phone);
  const email = data.email?.trim().toLowerCase() || null;
  const name = data.name?.trim() || 'Lead sem nome';

  try {
    // 1. Save/update MetaLead
    const metaLead = await prisma.metaLead.upsert({
      where: { leadgenId: data.leadgenId },
      create: {
        leadgenId: data.leadgenId,
        formId: data.formId,
        formName: data.formName,
        adId: data.adId,
        adName: data.adName,
        campaignId: data.campaignId,
        campaignName: data.campaignName,
        pageId: data.pageId,
        platform: data.platform || 'facebook',
        name,
        email,
        phone,
        rawData: data.rawData,
        status: 'processado',
        processedAt: new Date(),
      },
      update: {
        status: 'processado',
        processedAt: new Date(),
      },
    });

    // 2. Deduplicate: check by phone (priority), then email
    let existingClient = null;
    let isDuplicate = false;

    if (phone) {
      const cleanPhone = phone.replace('+55', '').slice(-11);
      existingClient = await prisma.client.findFirst({
        where: {
          OR: [
            { phone: { contains: cleanPhone } },
            { phone: { contains: phone } },
          ],
          isActive: true,
        },
      });
    }

    if (!existingClient && email) {
      existingClient = await prisma.client.findFirst({
        where: { email, isActive: true },
      });
    }

    let clientId: string;

    if (existingClient) {
      // Update existing client
      isDuplicate = true;
      clientId = existingClient.id;

      const currentTags = existingClient.tags || '';
      const newTags = currentTags.includes('Meta Ads')
        ? currentTags
        : (currentTags ? currentTags + ',Meta Ads' : 'Meta Ads');

      await prisma.client.update({
        where: { id: clientId },
        data: {
          ...(phone && !existingClient.phone ? { phone } : {}),
          ...(email && !existingClient.email ? { email } : {}),
          tags: newTags,
          source: existingClient.source || 'instagram',
        },
      });
    } else {
      // Create new client
      const newClient = await prisma.client.create({
        data: {
          name,
          phone: phone || undefined,
          email: email || undefined,
          source: 'instagram',
          stage: 'entrada',
          unit,
          tags: 'Meta Ads',
        },
      });
      clientId = newClient.id;
    }

    // 3. Update MetaLead with clientId
    await prisma.metaLead.update({
      where: { id: metaLead.id },
      data: { clientId },
    });

    // 4. Create pipeline entry (only if no active pipeline for this client)
    const existingPipeline = await prisma.salesPipeline.findFirst({
      where: {
        clientId,
        stage: { notIn: ['fechado', 'perdido'] },
      },
    });

    let pipelineId: string | undefined;

    if (!existingPipeline) {
      // Assign operator via round-robin
      const assignment = await assignLeadToOperator(unit);

      // Fetch default pipeline and first stage
      const defaultPipeline = await prisma.pipeline.findFirst({
        where: { unit },
        orderBy: { createdAt: 'asc' },
      }) || await prisma.pipeline.findFirst({
        orderBy: { createdAt: 'asc' }
      });

      let defPipelineId = null;
      let defStageId = null;

      if (defaultPipeline) {
        defPipelineId = defaultPipeline.id;
        const firstStage = await prisma.pipelineStage.findFirst({
          where: { pipelineId: defaultPipeline.id },
          orderBy: { position: 'asc' },
        });
        if (firstStage) defStageId = firstStage.id;
      }

      const pipeline = await prisma.salesPipeline.create({
        data: {
          clientId,
          clientName: name,
          stage: 'novo_lead',
          pipelineId: defPipelineId,
          stageId: defStageId,
          source: 'meta_ads',
          assignedTo: assignment?.userId,
          assignedName: assignment?.userName,
          unit,
          leadId: metaLead.id,
        },
      });
      pipelineId = pipeline.id;
    } else {
      pipelineId = existingPipeline.id;
    }

    // 5. Audit log
    await prisma.auditLog.create({
      data: {
        userName: 'Sistema',
        action: 'create',
        entity: 'meta_lead',
        entityId: metaLead.id,
        details: `Lead capturado da Meta: ${name} | Phone: ${phone || 'N/A'} | Email: ${email || 'N/A'} | ${isDuplicate ? 'Cliente existente atualizado' : 'Novo cliente criado'} | Pipeline: ${pipelineId}`,
      },
    });

    return { success: true, clientId, pipelineId, isDuplicate };

  } catch (error) {
    console.error('[LeadProcessor] Error:', error);

    // Mark lead as error
    try {
      await prisma.metaLead.update({
        where: { leadgenId: data.leadgenId },
        data: {
          status: 'erro',
          errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
        },
      });
    } catch { /* ignore update error */ }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
