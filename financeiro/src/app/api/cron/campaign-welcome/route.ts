import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processCampaignWelcomes } from "@/lib/whatsapp/campaign-welcome";
import { WELCOME_SCHEDULER_KEY } from "@/lib/whatsapp/campaign-welcome-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!secret || !timingSafeEqual(hash(req.headers.get('authorization') || ''), hash(`Bearer ${secret}`))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: WELCOME_SCHEDULER_KEY } });
    const state = setting ? JSON.parse(setting.value) : null;
    if (!state || state.secretHash !== hash(secret).toString('hex')) return NextResponse.json({ error: 'Agendador não provisionado para este ambiente.' }, { status: 503 });
    if (!state.readyAt) {
      // Marco criado pelo runtime publicado, não pelo build que ainda serve a versão antiga.
      await prisma.$executeRaw`UPDATE "AppSetting" SET value = (value::jsonb || jsonb_build_object('readyAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))::text,
        "updatedAt" = now() WHERE key = ${WELCOME_SCHEDULER_KEY} AND value::jsonb->>'readyAt' IS NULL`;
      console.info('[campaign-welcome] Agendador autenticado; recepção ativada sem envio retroativo.');
      return NextResponse.json({ success: true, activated: true, sent: 0 });
    }
    const results = await processCampaignWelcomes();
    console.info('[campaign-welcome] Etapas processadas:', results);
    await prisma.$executeRaw`UPDATE "AppSetting" SET value = (value::jsonb || jsonb_build_object('lastWorkerAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))::text,
      "updatedAt" = now() WHERE key = ${WELCOME_SCHEDULER_KEY}`;
    return NextResponse.json({ success: true, results });
  } catch {
    console.error('[campaign-welcome] Falha no processamento; consultar fila sem reenviar mensagens incertas.');
    return NextResponse.json({ error: 'Falha ao processar recepção' }, { status: 500 });
  }
}
