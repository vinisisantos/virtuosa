import { NextResponse } from "next/server";

import { processExpiredWhatsAppCallbacks } from "@/lib/whatsapp/callbacks";
import { processEvaluationDayReminders } from "@/lib/whatsapp/evaluation-day-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    let evaluationDayReminders: Awaited<ReturnType<typeof processEvaluationDayReminders>> | { error: string };
    try {
      evaluationDayReminders = await processEvaluationDayReminders();
    } catch (reminderError) {
      console.error("[Evaluation day reminders cron]", reminderError);
      evaluationDayReminders = { error: "Erro ao processar lembretes de avaliação" };
    }
    const callbackResult = await processExpiredWhatsAppCallbacks();
    return NextResponse.json({
      success: true,
      ...callbackResult,
      evaluationDayReminders,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[WhatsApp callbacks cron]", error);
    return NextResponse.json({ error: "Erro ao processar rechamadas" }, { status: 500 });
  }
}
