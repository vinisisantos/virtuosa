import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runAliceAutonomousBatch, processAliceAutonomousTurn } from "@/lib/ai-assistant/autonomy/runner";
import { claimAliceAutonomousTurn } from "@/lib/ai-assistant/autonomy/queue";
import { validAliceAutonomyCronAuthorization, ALICE_AUTONOMY_WORKER_STATE_KEY } from "@/lib/ai-assistant/autonomy/scheduler";
import { scheduleAliceAutonomyAppointment } from "@/lib/ai-assistant/autonomy/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function cooldown() {
  const value = JSON.stringify({ blockedUntil: new Date(Date.now() + 5 * 60_000).toISOString() });
  await prisma.appSetting.upsert({ where: { key: ALICE_AUTONOMY_WORKER_STATE_KEY }, create: { key: ALICE_AUTONOMY_WORKER_STATE_KEY, value }, update: { value } });
}
export async function POST(req: NextRequest) {
  if (!validAliceAutonomyCronAuthorization(req.headers.get("authorization"))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // O pg_net recebe ACK sem esperar modelo ou WhatsApp; after mantém o trabalho no orçamento desta função.
  after(async () => {
    try {
      const dependencies = { schedule: scheduleAliceAutonomyAppointment };
      const result = await runAliceAutonomousBatch(req, dependencies);
      if (("blockers" in result && result.blockers?.length) || result.outcomes.some((status) => ["failed", "uncertain"].includes(status))) await cooldown();
      const next = "continuation" in result ? result.continuation : null;
      if (!next) return;
      const delay = next.availableAt.getTime() - Date.now();
      if (delay > 3_000) return;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const claim = await claimAliceAutonomousTurn(prisma, next.id);
      if (claim) {
        const outcome = await processAliceAutonomousTurn(claim, req, dependencies);
        if (["failed", "uncertain"].includes(outcome)) await cooldown();
      }
    } catch {
      console.error("[AliceAutonomy] worker interrupted; no automatic replay");
      await cooldown().catch(() => {});
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
