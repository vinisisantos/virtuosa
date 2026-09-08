import { NextResponse } from "next/server";

import { processExpiredWhatsAppCallbacks } from "@/lib/whatsapp/callbacks";
import { processEvaluationDayReminders } from "@/lib/whatsapp/evaluation-day-reminder";
import { processEvaluationNoResponseReminders } from "@/lib/whatsapp/evaluation-no-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(req: Request) {
  const deadlineAt = Date.now() + 55000;
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
    let evaluationNoResponse: Awaited<ReturnType<typeof processEvaluationNoResponseReminders>> | { error: string };
    try {
      evaluationNoResponse = await processEvaluationNoResponseReminders(new Date(), { deadlineAt });
    } catch (error) {
      console.error("[Evaluation no response cron]", error);
      evaluationNoResponse = { error: "Erro ao processar lembretes sem resposta" };
    }
    return NextResponse.json({
      success: true,
      ...callbackResult,
      evaluationDayReminders,
      evaluationNoResponse,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[WhatsApp callbacks cron]", error);
    return NextResponse.json({ error: "Erro ao processar rechamadas" }, { status: 500 });
  }
}
