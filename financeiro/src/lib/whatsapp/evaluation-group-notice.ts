import { randomUUID } from "node:crypto";
import { Prisma, type WhatsAppEvaluationGroupNotice } from "@prisma/client";
import { prisma } from "@/lib/db";
import { evaluationGroupConfirmationSourcePredicate } from "@/lib/whatsapp/evaluation-group-confirmation-source";
import {
  EVALUATION_GROUP_INSTANCE_ID,
  EVALUATION_GROUP_SETTING_KEY,
  isEvaluationGroupJid,
  normalizeEvaluationGroupPhone,
  normalizeEvaluationGroupProcedure,
  normalizeEvaluationGroupText,
  parseEvaluationGroupConfig,
} from "@/lib/whatsapp/evaluation-group-notice-config";

const LEASE_MS = 2 * 60_000;
const MAX_PRE_SEND_ATTEMPTS = 3;
const ACTIVE_STATUSES = ["pendente", "confirmado", "nao_confirmou"];

type EnqueueDatabase = Pick<Prisma.TransactionClient, "appSetting" | "whatsAppEvaluationGroupNotice">;
type DispatchDatabase = Pick<Prisma.TransactionClient,
  "appSetting" | "whatsAppEvaluationGroupNotice" | "agendamento" | "whatsAppInstance" | "$queryRaw" | "$executeRaw">;

export type EvaluationGroupAppointment = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  procedimento: string;
  evaluationProcedure?: string | null;
  unit: string;
  startTime: Date;
  createdAt: Date;
  status: string;
};

function snapshotOf(appointment: EvaluationGroupAppointment) {
  const clientName = normalizeEvaluationGroupText(appointment.clientName, 200);
  const clientPhone = normalizeEvaluationGroupPhone(appointment.clientPhone);
  const evaluationProcedure = normalizeEvaluationGroupProcedure(appointment.evaluationProcedure);
  if (!clientName || !clientPhone || !evaluationProcedure) return null;
  return { clientName, clientPhone, evaluationProcedure };
}

function isNewEvaluation(appointment: EvaluationGroupAppointment, now: Date) {
  return appointment.unit === "SBC"
    && appointment.procedimento.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === "avaliacao"
    && ACTIVE_STATUSES.includes(appointment.status)
    && Number.isFinite(appointment.createdAt.getTime())
    && appointment.createdAt <= now
    && appointment.startTime > now;
}

export async function enqueueEvaluationGroupNotice(
  database: EnqueueDatabase,
  params: { appointment: EvaluationGroupAppointment; isNew: boolean; sourceInstanceId?: string | null },
  now = new Date(),
): Promise<string | null> {
  const { appointment } = params;
  if (!params.isNew || (params.sourceInstanceId && params.sourceInstanceId !== EVALUATION_GROUP_INSTANCE_ID)
    || !isNewEvaluation(appointment, now)) return null;
  const snapshot = snapshotOf(appointment);
  if (!snapshot) return null;

  const setting = await database.appSetting.findUnique({
    where: { key: EVALUATION_GROUP_SETTING_KEY }, select: { value: true },
  });
  const config = parseEvaluationGroupConfig(setting?.value);
  if (!config?.enabled || appointment.createdAt < new Date(config.activatedAt)) return null;

  const notice = await database.whatsAppEvaluationGroupNotice.upsert({
    where: { appointmentId_eventKey: { appointmentId: appointment.id, eventKey: "scheduled" } },
    create: {
      appointmentId: appointment.id,
      instanceId: config.instanceId,
      groupJid: config.groupJid,
      groupName: config.groupName,
      configActivatedAt: new Date(config.activatedAt),
      ...snapshot,
      startTime: appointment.startTime,
      appointmentCreatedAt: appointment.createdAt,
      availableAt: now,
    },
    // Repetir a transação não reabre nem substitui o primeiro aviso.
    update: {},
    select: { id: true },
  });
  return notice.id;
}

export type EvaluationGroupConfirmationSkipReason = "unchanged" | "not_confirmation" | "not_future_evaluation"
  | "disabled" | "unverified_source" | "missing_name" | "invalid_phone" | "missing_procedure";
export type EvaluationGroupConfirmationResult = {
  status: "queued" | "already_recorded" | "skipped";
  reason?: EvaluationGroupConfirmationSkipReason;
  noticeId?: string;
  state?: string;
};

export async function enqueueEvaluationGroupConfirmation(
  database: EnqueueDatabase & Pick<Prisma.TransactionClient, "$queryRaw">,
  params: { appointment: EvaluationGroupAppointment; previousStatus: string; recoverMissingNotice?: boolean },
  now = new Date(),
): Promise<EvaluationGroupConfirmationResult> {
  const { appointment, previousStatus } = params;
  const skip = (reason: EvaluationGroupConfirmationSkipReason): EvaluationGroupConfirmationResult => ({ status: "skipped", reason });
  if (previousStatus === "confirmado" && !params.recoverMissingNotice) return skip("unchanged");
  if (appointment.status !== "confirmado") return skip("not_confirmation");
  if (!isNewEvaluation(appointment, now)) return skip("not_future_evaluation");
  const setting = await database.appSetting.findUnique({
    where: { key: EVALUATION_GROUP_SETTING_KEY }, select: { value: true },
  });
  const config = parseEvaluationGroupConfig(setting?.value);
  if (!config?.enabled || !config.confirmationsActivatedAt || new Date(config.confirmationsActivatedAt) > now) return skip("disabled");
  const source = await database.$queryRaw<{ eligible: boolean }[]>(Prisma.sql`SELECT ${evaluationGroupConfirmationSourcePredicate({
    appointmentId: appointment.id, startTime: appointment.startTime, appointmentCreatedAt: appointment.createdAt,
    clientPhone: appointment.clientPhone, config,
  })} AS eligible`);
  if (!source[0]?.eligible) return skip("unverified_source");

  const eventKey = `confirmed:${appointment.startTime.toISOString()}`;
  const existing = await database.whatsAppEvaluationGroupNotice.findUnique({
    where: { appointmentId_eventKey: { appointmentId: appointment.id, eventKey } },
    select: { id: true, state: true },
  });
  if (existing) return { status: "already_recorded", noticeId: existing.id, state: existing.state };
  const clientName = normalizeEvaluationGroupText(appointment.clientName, 200);
  const clientPhone = normalizeEvaluationGroupPhone(appointment.clientPhone);
  const evaluationProcedure = normalizeEvaluationGroupProcedure(appointment.evaluationProcedure);
  if (!clientName) return skip("missing_name");
  if (!clientPhone) return skip("invalid_phone");
  if (!evaluationProcedure) return skip("missing_procedure");
  const id = randomUUID();
  const notice = await database.whatsAppEvaluationGroupNotice.upsert({
    where: { appointmentId_eventKey: { appointmentId: appointment.id, eventKey } },
    create: {
      id, appointmentId: appointment.id, eventType: "confirmed", eventKey,
      instanceId: config.instanceId, groupJid: config.groupJid, groupName: config.groupName,
      configActivatedAt: new Date(config.activatedAt), clientName, clientPhone, evaluationProcedure,
      startTime: appointment.startTime, appointmentCreatedAt: appointment.createdAt,
      availableAt: now, createdAt: now,
    },
    // A mesma ocorrência não reabre nem após uma alternância de status ou envio incerto.
    update: {}, select: { id: true, state: true },
  });
  return { status: notice.id === id ? "queued" : "already_recorded", noticeId: notice.id, state: notice.state };
}

export function buildEvaluationGroupNoticeMessage(notice: {
  clientName: string; clientPhone: string; evaluationProcedure: string; startTime: Date; eventType?: string;
}) {
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(notice.startTime);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(notice.startTime);
  return [
    notice.eventType === "confirmed" ? "✅ *Avaliação confirmada — SBC*" : "📅 *Nova avaliação — SBC*", "",
    `Nome: ${notice.clientName}`,
    `Telefone: ${notice.clientPhone}`,
    `Procedimento: ${notice.evaluationProcedure}`,
    `Data: ${date}`,
    `Horário: ${time}`,
  ].join("\n");
}

export function evaluationGroupNoticeMatchesAppointment(
  notice: WhatsAppEvaluationGroupNotice,
  appointment: EvaluationGroupAppointment | null,
  now: Date,
) {
  if (!appointment || !isNewEvaluation(appointment, now)) return false;
  if (notice.eventType === "confirmed") {
    if (appointment.status !== "confirmado" || notice.eventKey !== `confirmed:${appointment.startTime.toISOString()}`) return false;
  } else if (notice.eventType !== "scheduled" || notice.eventKey !== "scheduled") return false;
  const snapshot = snapshotOf(appointment);
  return snapshot !== null
    && snapshot.clientName === notice.clientName
    && snapshot.clientPhone === notice.clientPhone
    && snapshot.evaluationProcedure === notice.evaluationProcedure
    && appointment.createdAt.getTime() === notice.appointmentCreatedAt.getTime()
    && appointment.startTime.getTime() === notice.startTime.getTime();
}

type DispatchOptions = {
  database?: DispatchDatabase;
  fetcher?: typeof fetch;
  now?: () => Date;
  deadlineMs?: number;
};

export type EvaluationGroupNoticeDispatchResult = {
  status: "skipped" | "submitted" | "uncertain" | "cancelled" | "queued";
};

export async function dispatchEvaluationGroupNotice(
  id: string,
  options: DispatchOptions = {},
): Promise<EvaluationGroupNoticeDispatchResult> {
  const database = options.database ?? prisma;
  const currentTime = options.now ?? (() => new Date());
  const now = currentTime();
  const claimToken = randomUUID();
  const stale = new Date(now.getTime() - LEASE_MS);
  const rows = await database.$queryRaw<WhatsAppEvaluationGroupNotice[]>`
    UPDATE "WhatsAppEvaluationGroupNotice"
    SET "state" = 'processing', "claimToken" = ${claimToken}, "claimedAt" = ${now},
        "attempts" = "attempts" + 1, "updatedAt" = ${now}
    WHERE "id" = ${id} AND "instanceId" = ${EVALUATION_GROUP_INSTANCE_ID}
      AND "sendStartedAt" IS NULL AND "attempts" < ${MAX_PRE_SEND_ATTEMPTS}
      AND (("state" = 'queued' AND "availableAt" <= ${now})
        OR ("state" = 'processing' AND "claimedAt" < ${stale}))
    RETURNING *
  `;
  const notice = rows[0];
  if (!notice) return { status: "skipped" };
  let sendingStarted = false;
  const finish = async (state: "cancelled" | "uncertain", lastError: string) => {
    await database.whatsAppEvaluationGroupNotice.updateMany({
      where: { id, claimToken, state: sendingStarted ? "sending" : "processing" },
      data: { state, lastError, claimToken: null, claimedAt: null },
    });
    return { status: state } as const;
  };

  try {
    const setting = await database.appSetting.findUnique({
      where: { key: EVALUATION_GROUP_SETTING_KEY }, select: { value: true },
    });
    const config = parseEvaluationGroupConfig(setting?.value);
    if (!config?.enabled || config.instanceId !== notice.instanceId || config.groupJid !== notice.groupJid
      || config.activatedAt !== notice.configActivatedAt.toISOString()) {
      return finish("cancelled", "Configuração desativada ou destino alterado antes do envio.");
    }
    if (notice.eventType === "confirmed" && (!config.confirmationsActivatedAt
      || notice.createdAt < new Date(config.confirmationsActivatedAt))) {
      return finish("cancelled", "Aviso de confirmação fora do período habilitado.");
    }
    const appointment = await database.agendamento.findUnique({
      where: { id: notice.appointmentId },
      select: { id: true, clientName: true, clientPhone: true, procedimento: true, evaluationProcedure: true,
        unit: true, startTime: true, createdAt: true, status: true },
    });
    if (!evaluationGroupNoticeMatchesAppointment(notice, appointment, currentTime())) {
      return finish("cancelled", "Avaliação excluída, alterada, encerrada ou remarcada antes do envio.");
    }
    const instance = await database.whatsAppInstance.findUnique({
      where: { id: EVALUATION_GROUP_INSTANCE_ID },
      select: { id: true, name: true, unit: true, status: true, provider: true },
    });
    if (!instance || instance.unit !== "SBC" || instance.provider !== "evolution") {
      return finish("cancelled", "Instância fora do escopo aprovado.");
    }
    if (instance.status !== "connected") throw new Error("PRE_SEND_UNAVAILABLE");
    const url = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
    const apiKey = process.env.EVOLUTION_API_KEY || "";
    if (!url || !apiKey || !isEvaluationGroupJid(notice.groupJid)) throw new Error("PRE_SEND_UNAVAILABLE");
    const sendAt = currentTime();
    const remainingMs = options.deadlineMs === undefined ? 8_000 : options.deadlineMs - Date.now();
    if (remainingMs < 1_000) throw new Error("PRE_SEND_UNAVAILABLE");

    // O fence persiste ANTES do HTTP e revalida os dados crus da agenda e a configuração.
    // Após ele, nem timeout, crash nem resposta sem ID autorizam um segundo envio.
    const fenced = await database.$executeRaw`
      UPDATE "WhatsAppEvaluationGroupNotice" AS notice
      SET "state" = 'sending', "sendStartedAt" = ${sendAt}, "updatedAt" = ${sendAt}
      WHERE notice."id" = ${id} AND notice."state" = 'processing'
        AND notice."claimToken" = ${claimToken} AND notice."sendStartedAt" IS NULL
        AND EXISTS (SELECT 1 FROM "AppSetting" WHERE "key" = ${EVALUATION_GROUP_SETTING_KEY}
          AND "value" = ${setting!.value})
        AND EXISTS (SELECT 1 FROM "Agendamento" WHERE "id" = ${notice.appointmentId}
          AND "unit" = 'SBC' AND "procedimento" = ${appointment!.procedimento}
          AND "clientName" = ${appointment!.clientName} AND "clientPhone" = ${appointment!.clientPhone}
          AND "evaluationProcedure" = ${appointment!.evaluationProcedure}
          AND "startTime" = ${notice.startTime} AND "createdAt" = ${notice.appointmentCreatedAt}
          AND ((notice."eventType" = 'scheduled' AND "status" IN ('pendente', 'confirmado', 'nao_confirmou'))
            OR (notice."eventType" = 'confirmed' AND "status" = 'confirmado'))
          AND "startTime" > ${sendAt})
        AND EXISTS (SELECT 1 FROM "WhatsAppInstance" WHERE "id" = ${EVALUATION_GROUP_INSTANCE_ID}
          AND "name" = ${instance.name} AND "unit" = 'SBC' AND "provider" = 'evolution' AND "status" = 'connected')
        AND ${notice.eventType === "confirmed" ? evaluationGroupConfirmationSourcePredicate({
          appointmentId: notice.appointmentId, startTime: notice.startTime,
          appointmentCreatedAt: notice.appointmentCreatedAt, clientPhone: appointment!.clientPhone, config,
        }) : Prisma.sql`true`}
    `;
    if (fenced !== 1) return finish("cancelled", "Dados ou configuração alterados durante a preparação do envio.");
    sendingStarted = true;

    const httpTimeoutMs = Math.min(8_000, options.deadlineMs === undefined ? 8_000 : options.deadlineMs - Date.now());
    if (httpTimeoutMs < 1_000) {
      return finish("cancelled", "Prazo de processamento encerrado antes de chamar o provedor. Nenhum envio iniciado.");
    }

    const response = await (options.fetcher ?? fetch)(`${url}/message/sendText/${encodeURIComponent(instance.name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: notice.groupJid, text: buildEvaluationGroupNoticeMessage(notice) }),
      signal: AbortSignal.timeout(httpTimeoutMs),
    });
    const payload = await response.json().catch(() => null);
    const providerId = payload?.key?.id ?? payload?.id;
    if (!response.ok || typeof providerId !== "string" || !providerId.trim()) {
      return finish("uncertain", "O provedor não confirmou o aceite com identificador. Conferir no WhatsApp; não reenviar automaticamente.");
    }
    await database.whatsAppEvaluationGroupNotice.updateMany({
      where: { id, claimToken, state: "sending" },
      data: { state: "submitted", providerMessageId: providerId.trim(), submittedAt: currentTime(),
        claimToken: null, claimedAt: null, lastError: null },
    });
    return { status: "submitted" };
  } catch {
    // Não persistir payload/erro externo: pode conter chave, texto clínico ou URL privada.
    if (sendingStarted) return finish("uncertain", "Envio iniciado sem resultado seguro. Conferir no WhatsApp; não reenviar automaticamente.");
    if (notice.attempts >= MAX_PRE_SEND_ATTEMPTS) return finish("cancelled", "Preparação indisponível após três tentativas sem envio.");
    await database.whatsAppEvaluationGroupNotice.updateMany({
      where: { id, claimToken, state: "processing", sendStartedAt: null },
      data: { state: "queued", claimToken: null, claimedAt: null,
        availableAt: new Date(currentTime().getTime() + notice.attempts * 60_000),
        lastError: "Preparação indisponível; nenhuma requisição de envio iniciada." },
    });
    return { status: "queued" };
  }
}

export async function recoverEvaluationGroupNotices(
  params: { limit?: number; timeBudgetMs?: number } & DispatchOptions = {},
) {
  const database = params.database ?? prisma;
  const now = params.now?.() ?? new Date();
  const stale = new Date(now.getTime() - LEASE_MS);
  const deadlineMs = Math.min(params.deadlineMs ?? Infinity, Date.now() + Math.max(1_000, Math.min(params.timeBudgetMs ?? 10_000, 20_000)));
  // Uma tentativa interrompida depois do fence nunca volta à fila de envio.
  await database.$executeRaw`
    WITH stale AS (
      SELECT id FROM "WhatsAppEvaluationGroupNotice"
      WHERE "instanceId" = ${EVALUATION_GROUP_INSTANCE_ID} AND "state" = 'sending'
        AND "sendStartedAt" < ${stale} AND "claimedAt" < ${stale}
      ORDER BY "claimedAt" ASC FOR UPDATE SKIP LOCKED LIMIT 20
    )
    UPDATE "WhatsAppEvaluationGroupNotice" AS notice
    SET "state" = 'uncertain', "claimToken" = NULL, "claimedAt" = NULL, "updatedAt" = ${now},
      "lastError" = 'Processamento interrompido após iniciar envio. Conferir no WhatsApp; não reenviar automaticamente.'
    FROM stale WHERE notice.id = stale.id
  `;
  await database.$executeRaw`
    WITH stale AS (
      SELECT id FROM "WhatsAppEvaluationGroupNotice"
      WHERE "instanceId" = ${EVALUATION_GROUP_INSTANCE_ID} AND "state" = 'processing'
        AND "claimedAt" < ${stale} AND "sendStartedAt" IS NULL AND "attempts" >= ${MAX_PRE_SEND_ATTEMPTS}
      ORDER BY "claimedAt" ASC FOR UPDATE SKIP LOCKED LIMIT 20
    )
    UPDATE "WhatsAppEvaluationGroupNotice" AS notice
    SET "state" = 'cancelled', "claimToken" = NULL, "claimedAt" = NULL, "updatedAt" = ${now},
      "lastError" = 'Limite de preparação atingido sem envio.'
    FROM stale WHERE notice.id = stale.id
  `;
  const notices = await database.whatsAppEvaluationGroupNotice.findMany({
    where: { instanceId: EVALUATION_GROUP_INSTANCE_ID, sendStartedAt: null, attempts: { lt: MAX_PRE_SEND_ATTEMPTS },
      OR: [{ state: "queued", availableAt: { lte: now } }, { state: "processing", claimedAt: { lt: stale } }] },
    orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(params.limit ?? 2, 3)), select: { id: true },
  });
  const results: EvaluationGroupNoticeDispatchResult[] = [];
  for (const notice of notices) {
    if (Date.now() >= deadlineMs - 1_000) break;
    results.push(await dispatchEvaluationGroupNotice(notice.id, { ...params, database, deadlineMs }));
  }
  return { selected: notices.length, processed: results.length, results };
}
