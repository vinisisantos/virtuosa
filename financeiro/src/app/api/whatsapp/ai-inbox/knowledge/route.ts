import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { aiErrorResponse, requirePilotAccess } from "@/lib/ai-inbox/access";
import { reviewKnowledge } from "@/lib/ai-inbox/knowledge";
import { CONFIG_KEY, dayKey, InboxAiError } from "@/lib/ai-inbox/policy";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const access = await requirePilotAccess(req);
    const params = new URL(req.url).searchParams;
    const status = params.get("status") || "pending";
    if (!["pending", "approved", "rejected", "disabled"].includes(status))
      throw new InboxAiError("Filtro inválido");
    const offset = Math.floor(
      Math.min(5000, Math.max(0, Number(params.get("offset")) || 0)),
    );
    // Pending content remains private to permitted source boxes, even for a
    // reviewer. Only deidentified, explicitly approved fichas become unit-wide.
    const visible = Prisma.sql`(k.status = 'approved' OR k."sourceConversationId" IN (
      SELECT id FROM "WhatsAppConversation" WHERE "instanceId" IN (${Prisma.join(access.instanceIds)})))`;
    const rows =
      await prisma.$queryRaw(Prisma.sql`SELECT k.id, k.content, k.status, k.version, k."relatedIds", k."expiresAt", k."createdAt", k."updatedAt",
      CASE WHEN c."instanceId" IN (${Prisma.join(access.instanceIds)}) THEN k."sourceConversationId" ELSE NULL END AS "sourceConversationId",
      CASE WHEN c."instanceId" IN (${Prisma.join(access.instanceIds)}) THEN c."instanceId" ELSE NULL END AS "sourceInstanceId"
      FROM "AiInboxKnowledge" k LEFT JOIN "WhatsAppConversation" c ON c.id = k."sourceConversationId"
      WHERE k.unit = 'SCS' AND k.status = ${status} AND ${visible} ORDER BY k."updatedAt" DESC, k.id LIMIT 21 OFFSET ${offset}`);
    const [summary] = (await prisma.$queryRaw(Prisma.sql`SELECT
      (SELECT count(*)::int FROM "AiInboxObservation" q JOIN "WhatsAppConversation" c ON c.id = q."conversationId" WHERE c."instanceId" IN (${Prisma.join(access.instanceIds)}) AND revision > "processedRevision") AS queued,
      (SELECT count(*)::int FROM "AiInboxObservation" q JOIN "WhatsAppConversation" c ON c.id = q."conversationId" WHERE c."instanceId" IN (${Prisma.join(access.instanceIds)}) AND q.attempts >= 3 AND revision > "processedRevision") AS failed,
      (SELECT value FROM "AppSetting" WHERE key = ${`${CONFIG_KEY}:budget:${dayKey()}`}) AS budget`)) as {
      queued: number;
      failed: number;
      budget: string | null;
    }[];
    return Response.json({
      items: rows,
      summary,
      canReview: access.canReview,
      canReviewClinical: access.canReviewClinical,
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string" || !Number.isSafeInteger(body.version))
      throw new InboxAiError("Ficha inválida");
    return Response.json(await reviewKnowledge(req, body));
  } catch (error) {
    return aiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const access = await requirePilotAccess(req);
    if (!access.canReview)
      throw new InboxAiError("Somente revisores podem retomar falhas", 403);
    const body = await req.json();
    if (body.action !== "retry-failed") throw new InboxAiError("Ação inválida");
    const count =
      await prisma.$executeRaw(Prisma.sql`UPDATE "AiInboxObservation" SET attempts = 0, revision = revision + 1,
      "dueAt" = NOW(), error = NULL WHERE attempts >= 3 AND revision > "processedRevision"
      AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW()) AND "conversationId" IN (
        SELECT id FROM "WhatsAppConversation" WHERE "instanceId" IN (${Prisma.join(access.instanceIds)}))`);
    return Response.json({ retried: count });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
