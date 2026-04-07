import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processLead, fetchLeadDataFromMeta } from '@/lib/lead-processor';

// GET — Webhook verification (Meta sends this to verify your endpoint)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Try MetaConfig from DB first, fallback to env
  let verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  try {
    const config = await prisma.metaConfig.findFirst({ where: { isActive: true } });
    if (config?.verifyToken) verifyToken = config.verifyToken;
  } catch { /* use env fallback */ }

  if (!verifyToken) {
    console.warn('[Meta Lead Webhook] Verify token not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Meta Lead Webhook] Verified successfully');
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST — Receive leadgen events from Meta
export async function POST(req: Request) {
  let rawPayload = '';
  try {
    rawPayload = await req.text();
    const body = JSON.parse(rawPayload);

    // Log webhook received
    const webhookLog = await prisma.webhookLog.create({
      data: {
        source: 'meta_lead',
        eventType: 'leadgen',
        payload: rawPayload,
        status: 'received',
      },
    });

    // Meta sends: { entry: [{ changes: [{ value: { leadgen_id, ... }, field: "leadgen" }] }] }
    const entries = body?.entry || [];

    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        if (change.field !== 'leadgen') continue;

        const value = change.value;
        if (!value?.leadgen_id) continue;

        const leadgenId = String(value.leadgen_id);
        const formId = value.form_id ? String(value.form_id) : undefined;
        const adId = value.ad_id ? String(value.ad_id) : undefined;
        const pageId = value.page_id ? String(value.page_id) : undefined;

        // Update log to processing
        await prisma.webhookLog.update({
          where: { id: webhookLog.id },
          data: { status: 'processing' },
        });

        // Try to fetch complete lead data from Graph API
        let leadName: string | undefined;
        let leadEmail: string | undefined;
        let leadPhone: string | undefined;
        let leadRawData: string | undefined;
        let formName: string | undefined;
        let adName: string | undefined;
        let campaignId: string | undefined;
        let campaignName: string | undefined;

        // Get access token from config
        let accessToken = process.env.META_ACCESS_TOKEN;
        try {
          const config = await prisma.metaConfig.findFirst({ where: { isActive: true } });
          if (config?.accessToken) accessToken = config.accessToken;
        } catch { /* use env fallback */ }

        if (accessToken) {
          const leadData = await fetchLeadDataFromMeta(leadgenId, accessToken);
          if (leadData) {
            leadRawData = JSON.stringify(leadData);
            // Extract fields from lead data
            const fieldData = leadData.field_data as unknown as Array<{ name: string; values: string[] }> | undefined;
            if (Array.isArray(fieldData)) {
              for (const field of fieldData) {
                const val = field.values?.[0];
                if (!val) continue;
                const fieldName = field.name?.toLowerCase();
                if (fieldName === 'full_name' || fieldName === 'nome' || fieldName === 'nome_completo') {
                  leadName = val;
                } else if (fieldName === 'email') {
                  leadEmail = val;
                } else if (fieldName === 'phone_number' || fieldName === 'telefone' || fieldName === 'whatsapp') {
                  leadPhone = val;
                }
              }
            }

            // Try to get form name, ad name, campaign info
            if (leadData.ad_id || leadData.ad_name) {
              adName = leadData.ad_name as string;
            }
            if (leadData.campaign_id || leadData.campaign_name) {
              campaignId = leadData.campaign_id as string;
              campaignName = leadData.campaign_name as string;
            }
            if (leadData.form_id) {
              formName = leadData.form_name as string;
            }
          }
        }

        // Process the lead
        const result = await processLead({
          leadgenId,
          formId,
          formName,
          adId,
          adName,
          campaignId,
          campaignName,
          pageId,
          platform: value.platform || 'facebook',
          name: leadName,
          email: leadEmail,
          phone: leadPhone,
          rawData: leadRawData || rawPayload,
        });

        // Update webhook log
        await prisma.webhookLog.update({
          where: { id: webhookLog.id },
          data: {
            status: result.success ? 'processed' : 'error',
            errorMessage: result.error,
            processedAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Meta Lead Webhook] Error:', error);

    // Log error
    try {
      await prisma.webhookLog.create({
        data: {
          source: 'meta_lead',
          eventType: 'leadgen',
          payload: rawPayload || null,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } catch { /* ignore logging error */ }

    // Always return 200 to Meta to prevent retries
    return NextResponse.json({ status: 'ok' });
  }
}
