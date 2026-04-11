import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

/**
 * POST /api/surveys/send
 * Cron endpoint — checks for scheduled surveys whose time has passed
 * and sends them via Evolution API WhatsApp.
 * Should be called every 5 minutes by Vercel Cron or client-side polling.
 */

// Survey message template
function buildSurveyMessage(clientName: string): string {
  const firstName = clientName.split(' ')[0];
  return (
    `Olá ${firstName}! 😊\n\n` +
    `Agradecemos por escolher a *Virtuosa*! 💜\n` +
    `Gostaríamos de saber como foi sua experiência.\n\n` +
    `Responda com uma nota de *1 a 5*:\n` +
    `1 ⭐ Ruim\n` +
    `2 ⭐⭐ Regular\n` +
    `3 ⭐⭐⭐ Bom\n` +
    `4 ⭐⭐⭐⭐ Muito bom\n` +
    `5 ⭐⭐⭐⭐⭐ Excelente`
  );
}

// Helper to get Evolution API config
async function getEvolutionConfig(unit: string) {
  const config = await (prisma as any).evolutionConfig.findUnique({ where: { unit } });
  if (!config?.apiUrl || !config?.apiKey) return null;
  return {
    baseUrl: (config.apiUrl as string).replace(/\/$/, ''),
    headers: { 'apikey': config.apiKey as string, 'Content-Type': 'application/json' },
    instanceName: config.instanceName || 'virtuosa',
  };
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const now = new Date();

    // Find surveys that are scheduled and past their scheduledFor time
    const pendingSurveys = await (prisma as any).surveyResponse.findMany({
      where: {
        status: 'scheduled',
        scheduledFor: { lte: now },
      },
      take: 20, // Process max 20 per run to avoid timeouts
    });

    if (pendingSurveys.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const survey of pendingSurveys) {
      try {
        const config = await getEvolutionConfig(survey.unit);
        if (!config) {
          // No Evolution config for this unit — mark as expired
          await (prisma as any).surveyResponse.update({
            where: { id: survey.id },
            data: { status: 'expired' },
          });
          failed++;
          continue;
        }

        // Build the JID for sending
        const sendNumber = survey.remoteJid.includes('@lid')
          ? survey.remoteJid
          : survey.remoteJid.replace('@s.whatsapp.net', '');

        // Send the survey message
        const res = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify({
            number: sendNumber,
            text: buildSurveyMessage(survey.clientName),
          }),
        });

        if (res.ok) {
          await (prisma as any).surveyResponse.update({
            where: { id: survey.id },
            data: { status: 'sent', sentAt: new Date() },
          });
          sent++;
          console.log(`[Survey] Sent to ${survey.clientName} (${survey.remoteJid})`);
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error(`[Survey] Failed to send to ${survey.clientName}:`, errData);
          // Mark as expired if we can't reach them
          await (prisma as any).surveyResponse.update({
            where: { id: survey.id },
            data: { status: 'expired' },
          });
          failed++;
        }
      } catch (err) {
        console.error(`[Survey] Error sending to ${survey.clientName}:`, err);
        failed++;
      }
    }

    return NextResponse.json({ sent, failed, total: pendingSurveys.length });
  } catch (error) {
    console.error('[Survey Send] Error:', error);
    return NextResponse.json({ error: 'Erro ao enviar pesquisas' }, { status: 500 });
  }
}

// GET — can also trigger the send (useful for Vercel Cron)
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  return POST(req);
}
