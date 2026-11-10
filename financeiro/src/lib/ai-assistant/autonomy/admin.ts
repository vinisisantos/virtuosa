import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AI_ASSISTANT_CONFIG_KEY, AiAssistantError, parseAiAssistantConfig } from "@/lib/ai-assistant/policy";
import { loadAliceAutonomyConfig, aliceAutonomyRuntimeStatus } from "@/lib/ai-assistant/autonomy/config";
import { ALICE_AUTONOMY_CONFIG_KEY, ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_MODEL, aliceRetryableTurnError,
  parseAliceAutonomyConfig } from "@/lib/ai-assistant/autonomy/policy";
import { activateAliceConversation } from "@/lib/ai-assistant/autonomy/activate";
import { aliceAutonomySummaryQuery, aliceBacklogQuery, type AliceBacklogRow } from "@/lib/ai-assistant/autonomy/admin-queries";
import { createAliceBacklogPreview, verifyAliceBacklogPreview } from "@/lib/ai-assistant/autonomy/preview";
import { ALICE_AUTONOMY_CRON_JOB, ALICE_AUTONOMY_WORKER_STATE_KEY } from "@/lib/ai-assistant/autonomy/scheduler";

export async function aliceAutonomyReadiness(database = prisma) {
  const [instance, settings, cron] = await Promise.all([
    database.whatsAppInstance.findUnique({ where: { id: ALICE_AUTONOMY_INSTANCE_ID }, select: { id: true, unit: true, status: true } }),
    database.appSetting.findMany({ where: { key: { in: [AI_ASSISTANT_CONFIG_KEY, "alice_auto_schedule_sbc_v1", ALICE_AUTONOMY_WORKER_STATE_KEY] } }, select: { key: true, value: true } }),
    database.$queryRaw<{ active: boolean; schedule: string }[]>`SELECT active, schedule FROM cron.job WHERE jobname=${ALICE_AUTONOMY_CRON_JOB}`.catch(() => []),
  ]);
  const assistant = settings.find((item) => item.key === AI_ASSISTANT_CONFIG_KEY);
  let bookingReady = false;
  let blockedUntil: string | null = null;
  try {
    const booking = JSON.parse(settings.find((item) => item.key === "alice_auto_schedule_sbc_v1")?.value || "{}");
    bookingReady = booking?.enabled === true && typeof booking.activatedAt === "string" && Number.isFinite(Date.parse(booking.activatedAt));
  } catch {}
  try {
    const state = JSON.parse(settings.find((item) => item.key === ALICE_AUTONOMY_WORKER_STATE_KEY)?.value || "{}");
    if (typeof state.blockedUntil === "string" && Date.parse(state.blockedUntil) > Date.now()) blockedUntil = new Date(state.blockedUntil).toISOString();
  } catch {}
  const blockers = [...aliceAutonomyRuntimeStatus().blockers,
    ...(!parseAiAssistantConfig(assistant?.value).enabled ? ["A configuração principal da Alice está pausada."] : []),
    ...(!instance || instance.unit !== "SBC" ? ["A caixa autorizada de SBC não foi encontrada."] : []),
    ...(instance?.status !== "connected" ? ["A caixa de WhatsApp de SBC não está conectada."] : []),
    ...(!cron.some((job) => job.active && job.schedule === "10 seconds") ? ["O agendador da Alice ainda não foi provisionado."] : []),
    ...(!bookingReady ? ["O agendamento autorizado de SBC está pausado ou sem marco de ativação válido."] : []),
    ...((process.env.CRON_SECRET?.trim().length || 0) < 32 ? ["A autenticação do agendador não está configurada no servidor."] : []),
    ...(blockedUntil ? [`A operação entrou em espera de segurança após falha ou bloqueio técnico até ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(blockedUntil))} (São Paulo). Atualize após esse horário; envios incertos não serão repetidos.`] : []),
  ];
  return { ready: blockers.length === 0, blockers, operational: { blockedUntil } };
}

function parseCursor(value?: string | null): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    if (value.length > 300) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString());
    const createdAt = new Date(cursor.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || typeof cursor.id !== "string" || cursor.id.length > 100) throw new Error();
    return { createdAt, id: cursor.id };
  } catch { throw new AiAssistantError("Cursor inválido. Atualize o acompanhamento.", 400); }
}

export async function getAliceAutonomyMonitoring(params: { days?: number; cursor?: string | null }, database = prisma, now = new Date(), checkReadiness = aliceAutonomyReadiness) {
  const days = Math.min(30, Math.max(1, Number.isFinite(params.days) ? Math.floor(params.days!) : 7));
  const since = new Date(now.getTime() - days * 86_400_000);
  const cursor = parseCursor(params.cursor);
  const [config, readiness] = await Promise.all([loadAliceAutonomyConfig(database), checkReadiness(database)]);
  const [summaries, rows, candidates] = await Promise.all([
    database.$queryRaw<Record<string, number>[]>(aliceAutonomySummaryQuery(since)),
    database.$queryRaw<Array<{ id: string; conversationId: string; contactName: string | null; phoneLast4: string | null; status: string; createdAt: Date;
      firstSentAt: Date | null; costMicroUsd: number; error: string | null; appointmentId: string | null; instanceId: string; origin: string;
      usageRecorded: boolean; generationStartedAt: Date | null; providerMessageIds: Prisma.JsonValue; nextMessageIndex: number;
      sourceTimestamp: Date | null; sourceCreatedAt: Date | null; sourceType: string | null; sourceBody: string | null }>>(Prisma.sql`
      SELECT t.id,t."conversationId",contact.name AS "contactName",RIGHT(regexp_replace(contact.phone,'[^0-9]','','g'),4) AS "phoneLast4",
        t.status,t."createdAt",t."firstSentAt",t."costMicroUsd",t.error,t."appointmentId",t."instanceId",t.origin,t."usageRecorded",t."generationStartedAt",
        t."providerMessageIds",t."nextMessageIndex",source.timestamp AS "sourceTimestamp",source."createdAt" AS "sourceCreatedAt",
        source.type AS "sourceType",source.body AS "sourceBody"
      FROM "AliceAutonomousTurn" t LEFT JOIN "WhatsAppConversation" c ON c.id=t."conversationId" AND c."instanceId"=t."instanceId"
      LEFT JOIN "WhatsAppContact" contact ON contact.id=c."contactId"
      LEFT JOIN "WhatsAppMessage" source ON source.id=t."sourceMessageId" AND source."conversationId"=t."conversationId"
      WHERE t.unit='SBC' AND t."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID} AND t."createdAt">=${since}
        ${cursor ? Prisma.sql`AND (t."createdAt",t.id)<(${cursor.createdAt},${cursor.id})` : Prisma.empty}
      ORDER BY t."createdAt" DESC,t.id DESC LIMIT 51`),
    database.$queryRaw<AliceBacklogRow[]>(aliceBacklogQuery({ cutoff: now, limit: 201 })),
  ]);
  const selected = rows.slice(0, 50);
  const last = selected.at(-1);
  return {
    config: { enabled: config.enabled, activatedAt: config.activatedAt, instanceId: config.instanceId,
      backlogAnchorConversationId: config.backlogAnchorConversationId, initialDelaySeconds: 30, complementDelaySeconds: 3, monthlyLimitUsd: null },
    readiness, operational: readiness.operational, summary: summaries[0],
    items: selected.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), firstSentAt: row.firstSentAt?.toISOString() || null,
      costMicroUsd: row.generationStartedAt && !row.usageRecorded ? null : row.costMicroUsd,
      costUnknown: Boolean(row.generationStartedAt && !row.usageRecorded), error: row.error ? publicAliceTurnError(row.error) : null,
      retryable: (row.status === "needs_human" || row.status === "failed") && aliceRetryableTurnError(row.error)
        && row.origin === "inbound" && row.sourceTimestamp !== null && row.sourceCreatedAt !== null
        && row.sourceTimestamp >= new Date(now.getTime() - 100 * 60 * 60 * 1000)
        && row.sourceCreatedAt >= new Date(now.getTime() - 100 * 60 * 60 * 1000)
        && row.sourceType === "text" && Boolean(row.sourceBody?.trim())
        && !row.firstSentAt && !row.appointmentId && row.nextMessageIndex === 0
        && Array.isArray(row.providerMessageIds) && row.providerMessageIds.length === 0,
      sourceTimestamp: undefined, sourceCreatedAt: undefined, providerMessageIds: undefined, nextMessageIndex: undefined,
      sourceType: undefined, sourceBody: undefined,
      generationStartedAt: undefined })),
    nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null,
    backlogCandidates: candidates.slice(0, 200).map((row) => ({ conversationId: row.conversationId, contactName: row.contactName,
      phoneLast4: row.phoneLast4, unreadCount: row.unreadCount, lastInboundAt: row.lastInboundAt.toISOString(), previewToken: createAliceBacklogPreview(row, now) })),
    backlogTruncated: candidates.length > 200,
  };
}

export async function retryAliceFailedTurn(turnId: string, actor: Pick<AuthPayload, "userId" | "name">, database = prisma, now = new Date()) {
  if (!turnId.trim() || turnId.length > 100) throw new AiAssistantError("Atendimento inválido.", 400);
  const config = await loadAliceAutonomyConfig(database);
  if (!config.enabled || !config.activatedAt || !aliceAutonomyRuntimeStatus().ready) {
    throw new AiAssistantError("A Alice precisa estar ativa e disponível em SBC para retomar este atendimento.", 409);
  }
  const turn = await database.aliceAutonomousTurn.findFirst({ where: { id: turnId, instanceId: ALICE_AUTONOMY_INSTANCE_ID,
    unit: "SBC", status: { in: ["needs_human", "failed"] } }, select: { id: true, conversationId: true, instanceId: true,
      sourceMessageId: true, status: true, error: true, origin: true, firstSentAt: true, appointmentId: true,
      generationStartedAt: true, nextMessageIndex: true, providerMessageIds: true, claimToken: true } });
  if (!turn || !aliceRetryableTurnError(turn.error) || turn.origin !== "inbound" || turn.firstSentAt || turn.appointmentId
    || turn.nextMessageIndex !== 0 || !turn.generationStartedAt || turn.claimToken
    || !Array.isArray(turn.providerMessageIds) || turn.providerMessageIds.length !== 0) {
    throw new AiAssistantError("Esta falha não pode ser repetida automaticamente. Confira a conversa e o status do agendamento.", 409);
  }
  const conversation = await database.whatsAppConversation.findFirst({ where: { id: turn.conversationId, instanceId: turn.instanceId },
    select: { id: true, aiMode: true, aiModeUpdatedBy: true, aiModeUpdatedAt: true, instanceId: true } });
  if (!conversation || conversation.aiMode !== "agent") {
    throw new AiAssistantError("A conversa não está mais no atendimento autônomo. Atualize antes de tentar novamente.", 409);
  }
  await activateAliceConversation(turn.conversationId, conversation, actor.userId, new Date(config.activatedAt), turn.sourceMessageId, database, now);
  await database.activityLog.create({ data: { userId: actor.userId, userName: actor.name || "Administrador", action: "UPDATE",
    entityType: "ALICE_AUTONOMY_TURN", entityId: turn.id, unit: "SBC",
    description: "Tentativa individual da Alice retomada pelo acompanhamento em SBC.",
    metadata: JSON.stringify({ status: turn.status, error: turn.error, sourceMessageId: turn.sourceMessageId }) } });
  return { queued: true };
}

function publicAliceTurnError(code: string) {
  if (code.includes("uncertain") || code.includes("interrupted")) return "Confirmação incompleta; conferir antes de retomar. Não haverá reenvio automático.";
  if (code.includes("clinical")) return "Dúvida clínica encaminhada à equipe.";
  if (code.includes("human") || code.includes("review")) return "Atendimento requer revisão da equipe.";
  if (code.includes("changed") || code.includes("customer")) return "Conversa atualizada ou assumida pela equipe; saída antiga cancelada.";
  return "A ação não foi concluída automaticamente. Confira a conversa.";
}

export async function setAliceAutonomyEnabled(input: unknown, actor: Pick<AuthPayload, "userId" | "name">, database = prisma, now = new Date(), checkReadiness = aliceAutonomyReadiness) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AiAssistantError("Configuração inválida.", 400);
  const body = input as Record<string, unknown>;
  if (typeof body.enabled !== "boolean" || (body.unit !== undefined && body.unit !== "SBC")) throw new AiAssistantError("A autonomia está disponível somente em SBC.", 400);
  const anchorId = typeof body.backlogAnchorConversationId === "string" ? body.backlogAnchorConversationId.trim() : null;
  if (anchorId && anchorId.length > 100) throw new AiAssistantError("Conversa inicial inválida.", 400);
  if (body.enabled && !(await checkReadiness(database)).ready) throw new AiAssistantError("Existem bloqueios de configuração. Atualize o acompanhamento antes de ativar.", 409);
  const preview = body.enabled && anchorId ? verifyAliceBacklogPreview(body.backlogPreviewToken, anchorId, now) : null;
  return database.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ALICE_AUTONOMY_CONFIG_KEY}))`;
    // Mesma ordem de locks do agendamento: configuração antes da conversa.
    const locked = await tx.$queryRaw<{ key: string; value: string }[]>`SELECT key,value FROM "AppSetting" WHERE key IN (${ALICE_AUTONOMY_CONFIG_KEY},${AI_ASSISTANT_CONFIG_KEY}) ORDER BY key FOR UPDATE`;
    const stored = locked.find((item) => item.key === ALICE_AUTONOMY_CONFIG_KEY);
    const current = parseAliceAutonomyConfig(stored?.value);
    if (body.enabled && !current.activatedAt && !preview) throw new AiAssistantError("Selecione uma conversa inicial a partir da prévia atualizada.", 400);
    if (body.enabled && current.enabled && !preview) throw new AiAssistantError("Selecione uma pendência da prévia atualizada para retomar sem pausar a operação.", 409);
    let cohort: AliceBacklogRow[] = [];
    if (preview && anchorId) {
      const cutoff = now;
      const anchor = (await tx.$queryRaw<AliceBacklogRow[]>(aliceBacklogQuery({ cutoff, anchorId, limit: 1 })))[0];
      if (!anchor || anchor.sourceMessageId !== preview.sourceMessageId || anchor.lastInboundAt.toISOString() !== preview.timestamp) {
        throw new AiAssistantError("A conversa inicial mudou ou deixou de estar pendente. Atualize a prévia.", 409);
      }
      cohort = await tx.$queryRaw<AliceBacklogRow[]>(aliceBacklogQuery({ cutoff, from: anchor.lastInboundAt, boundaryId: anchorId, lock: true }));
      if (cohort.length > 200) throw new AiAssistantError("A retomada supera 200 conversas. Escolha um ponto mais recente para manter o lote controlado.", 409);
      if (!cohort.some((row) => row.conversationId === anchorId && row.sourceMessageId === preview.sourceMessageId)) throw new AiAssistantError("A conversa inicial mudou. Atualize a prévia.", 409);
      await tx.whatsAppConversation.updateMany({ where: { id: { in: cohort.map((row) => row.conversationId) }, instanceId: ALICE_AUTONOMY_INSTANCE_ID },
        data: { aiMode: "agent", aiModeUpdatedAt: now, aiModeUpdatedBy: "alice-autonomy-activation" } });
    }
    const value = { ...current, enabled: body.enabled, activatedAt: body.enabled ? current.activatedAt || now.toISOString() : current.activatedAt,
      backlogAnchorConversationId: body.enabled && anchorId ? anchorId : current.backlogAnchorConversationId, model: ALICE_AUTONOMY_MODEL };
    await tx.appSetting.upsert({ where: { key: ALICE_AUTONOMY_CONFIG_KEY }, create: { key: ALICE_AUTONOMY_CONFIG_KEY, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
    if (body.enabled && !current.enabled) await tx.appSetting.upsert({ where: { key: ALICE_AUTONOMY_WORKER_STATE_KEY }, create: { key: ALICE_AUTONOMY_WORKER_STATE_KEY, value: "{}" }, update: { value: "{}" } });
    if (!body.enabled) {
      await tx.aliceAutonomousTurn.updateMany({ where: { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: "queued" },
        data: { status: "skipped", completedAt: now, claimToken: null, messagesJson: Prisma.JsonNull, error: "global_pause" } });
      await tx.whatsAppConversation.updateMany({ where: { instanceId: ALICE_AUTONOMY_INSTANCE_ID, aiMode: "agent" },
        data: { aiMode: "manual", aiModeUpdatedAt: now, aiModeUpdatedBy: "alice-global-pause" } });
    }
    const added = cohort.length ? await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "AliceAutonomousTurn" (id,"conversationId","instanceId",unit,"sourceMessageId",origin,"availableAt","updatedAt")
      VALUES ${Prisma.join(cohort.map((row, index) => Prisma.sql`(${randomUUID()},${row.conversationId},${ALICE_AUTONOMY_INSTANCE_ID},'SBC',${row.sourceMessageId},'backlog',${new Date(now.getTime() + 30_000 + index)},${now})`))}
      ON CONFLICT ("conversationId","sourceMessageId") DO UPDATE SET status='queued',"availableAt"=EXCLUDED."availableAt",
        "claimToken"=NULL,"claimedAt"=NULL,"completedAt"=NULL,error=NULL,"updatedAt"=EXCLUDED."updatedAt"
      WHERE "AliceAutonomousTurn".status='skipped' AND "AliceAutonomousTurn".error='global_pause' AND "AliceAutonomousTurn"."firstSentAt" IS NULL
      RETURNING id`) : [];
    const description = !body.enabled ? "Atendimento autônomo da Alice pausado em SBC."
      : current.enabled ? "Pendências retomadas pela Alice em SBC." : "Atendimento autônomo da Alice ativado em SBC.";
    await tx.activityLog.create({ data: { userId: actor.userId, userName: actor.name || "Administrador", action: "UPDATE", entityType: "ALICE_AUTONOMY",
      entityId: ALICE_AUTONOMY_CONFIG_KEY, unit: "SBC", description,
      metadata: JSON.stringify({ before: current, after: value, backlogEnqueued: added.length, backlogCutoff: cohort.length ? now.toISOString() : null }) } });
    return { config: value, backlogEnqueued: added.length };
  }, { timeout: 15_000 });
}
