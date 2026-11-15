import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminRole } from "@/lib/role-access";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  normalizeManualGroupMessage,
  PINK_FRIDAY_SBC_GROUP_INSTANCE_ID,
  PINK_FRIDAY_SBC_GROUP_NAME,
  PINK_FRIDAY_SBC_GROUP_UNIT,
} from "@/lib/whatsapp/manual-group-message-policy";

export const dynamic = "force-dynamic";

type GroupSnapshot = { id: string; name: string; size: number | null };

function isUniqueConstraintError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

function saoPauloDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function authorize(req: NextRequest, requireAdmin = false) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const params = req.nextUrl.searchParams;
  if (params.get("unit") !== PINK_FRIDAY_SBC_GROUP_UNIT
    || params.get("targetInstanceId") !== PINK_FRIDAY_SBC_GROUP_INSTANCE_ID) {
    return NextResponse.json({ error: "Selecione a unidade e a instância autorizadas para este grupo." }, { status: 403 });
  }

  const { instances } = await getInstancesForRequest(req);
  const instance = instances.find(candidate => candidate.id === PINK_FRIDAY_SBC_GROUP_INSTANCE_ID
    && candidate.unit === PINK_FRIDAY_SBC_GROUP_UNIT && candidate.canView === true);
  if (!instance) return NextResponse.json({ error: "Sem acesso à instância Leads - Paloma SBC." }, { status: 403 });

  const canManage = isAdminRole(req.headers.get("x-user-role")) && instance.canReply === true;
  if (requireAdmin && !canManage) {
    return NextResponse.json({ error: "Somente um administrador com permissão de envio pode publicar no grupo." }, { status: 403 });
  }
  return { userId, instance, canManage };
}

async function findExactGroup(instanceName: string): Promise<GroupSnapshot | null> {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!url || !apiKey) throw new Error("A conexão com a Evolution não está configurada neste ambiente.");

  let response: Response;
  try {
    response = await fetch(`${url}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`, {
      method: "GET", headers: { apikey: apiKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error("Não foi possível conferir o grupo na Evolution. Nenhum envio foi iniciado.");
  }
  if (!response.ok) throw new Error("A Evolution não confirmou a consulta do grupo. Nenhum envio foi iniciado.");

  const payload: unknown = await response.json().catch(() => null);
  if (!Array.isArray(payload)) throw new Error("A lista de grupos retornada pela Evolution é inválida. Nenhum envio foi iniciado.");
  const exact = payload.filter((value): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value)
    && typeof value.id === "string" && /^\d+(?:-\d+)?@g\.us$/.test(value.id)
    && typeof value.subject === "string"
    && value.subject.normalize("NFC") === PINK_FRIDAY_SBC_GROUP_NAME.normalize("NFC"));
  if (exact.length !== 1) return null;
  const group = exact[0];
  return {
    id: group.id as string,
    name: PINK_FRIDAY_SBC_GROUP_NAME,
    size: typeof group.size === "number" && Number.isInteger(group.size) && group.size >= 0 ? group.size : null,
  };
}

async function updateAttempt(key: string, logId: string, state: "submitted" | "rejected" | "uncertain", details: {
  providerStatus?: number; messageId?: string | null; description: string;
}) {
  const current = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(current?.value || "{}"); } catch { /* Keep the stored send fence if it cannot be read. */ }
  const value = JSON.stringify({ ...metadata, state, providerStatus: details.providerStatus ?? null,
    messageId: details.messageId || null, finishedAt: new Date().toISOString() });
  await prisma.$transaction([
    prisma.appSetting.update({ where: { key }, data: { value } }),
    prisma.activityLog.update({ where: { id: logId }, data: {
      description: details.description,
      metadata: JSON.stringify({ ...metadata, state, providerStatus: details.providerStatus ?? null,
        messageId: details.messageId || null, finishedAt: new Date().toISOString() }),
    } }),
  ]);
}

export async function GET(req: NextRequest) {
  try {
    const allowed = await authorize(req);
    if (allowed instanceof NextResponse) return allowed;
    return NextResponse.json({
      groupName: PINK_FRIDAY_SBC_GROUP_NAME,
      instanceName: allowed.instance.name,
      connected: allowed.instance.status === "connected" && allowed.instance.provider === "evolution",
      canSend: allowed.canManage,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível conferir a instância. Tente novamente." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const allowed = await authorize(req, true);
  if (allowed instanceof NextResponse) return allowed;
  const { instance, userId } = allowed;
  if (instance.status !== "connected" || instance.provider !== "evolution") {
    return NextResponse.json({ error: "Leads - Paloma SBC precisa estar conectada à Evolution para enviar." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const message = normalizeManualGroupMessage(body?.message);
  if (!message) return NextResponse.json({ error: "Informe uma mensagem de até 4.096 caracteres." }, { status: 400 });

  let group: GroupSnapshot | null;
  try { group = await findExactGroup(instance.name); }
  catch (error) {
    const expected = error instanceof Error ? error.message : "Não foi possível consultar o grupo.";
    return NextResponse.json({ error: expected }, { status: 502 });
  }
  if (!group) return NextResponse.json({ error: "Não encontrei exatamente um grupo com esse nome nesta instância. Nenhum envio foi iniciado." }, { status: 409 });

  const day = saoPauloDate();
  const bodyHash = createHash("sha256").update(message).digest("hex");
  const keySuffix = createHash("sha256").update(`${group.id}\n${day}\n${bodyHash}`).digest("hex").slice(0, 40);
  const key = `whatsapp_manual_group_send_pink_friday_sbc_${day}_${keySuffix}`;
  const startedAt = new Date().toISOString();
  const fence = {
    state: "sending", instanceId: instance.id, groupJid: group.id, groupName: group.name,
    unit: PINK_FRIDAY_SBC_GROUP_UNIT, userId, bodyHash, bodyLength: message.length, startedAt,
  };

  try {
    await prisma.appSetting.create({ data: { key, value: JSON.stringify(fence) } });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Não foi possível registrar a tentativa. Nenhuma mensagem foi enviada." }, { status: 503 });
    }
    return NextResponse.json({ error: "Uma tentativa com esse mesmo texto já foi iniciada hoje para o grupo. Confira o grupo antes de fazer qualquer outro envio." }, { status: 409 });
  }

  let log: { id: string };
  try {
    log = await prisma.activityLog.create({ data: {
      userId, userName: req.headers.get("x-user-name") || "Administrador",
      action: "whatsapp_manual_group_message_started", entityType: "WhatsAppManualGroupMessage",
      entityId: group.id, unit: PINK_FRIDAY_SBC_GROUP_UNIT,
      description: `Iniciado envio manual para o grupo ${group.name}.`,
      metadata: JSON.stringify({ ...fence, targetInstanceName: instance.name, groupSize: group.size }),
    }, select: { id: true } });
  } catch {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    return NextResponse.json({ error: "Não foi possível registrar a auditoria. Nenhuma mensagem foi enviada." }, { status: 503 });
  }

  const apiUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance.name)}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey || "" },
      body: JSON.stringify({ number: group.id, text: message }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
  } catch {
    await updateAttempt(key, log.id, "uncertain", { description: `Resultado incerto no envio manual ao grupo ${group.name}. Não repetir sem conferir o grupo.` }).catch(() => {});
    return NextResponse.json({ state: "uncertain", error: "A Evolution não confirmou o resultado. Confira o grupo antes de tentar novamente." }, { status: 502 });
  }

  const providerData: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const definitelyRejected = response.status >= 400 && response.status < 500
      && ![408, 499].includes(response.status);
    const state = definitelyRejected ? "rejected" : "uncertain";
    const description = definitelyRejected
      ? `A Evolution recusou o envio manual ao grupo ${group.name} (${response.status}).`
      : `Resultado incerto no envio manual ao grupo ${group.name} (${response.status}). Não repetir sem conferir o grupo.`;
    await updateAttempt(key, log.id, state, { providerStatus: response.status, description }).catch(() => {});
    if (definitelyRejected) await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    return NextResponse.json({ state, error: definitelyRejected
      ? "A Evolution recusou o envio. A mensagem não foi aceita; confira a conexão e a permissão da instância no grupo."
      : "A Evolution não confirmou o resultado. Confira o grupo antes de tentar novamente." }, { status: definitelyRejected ? 409 : 502 });
  }

  const responseRecord = providerData && typeof providerData === "object" ? providerData as Record<string, unknown> : {};
  const responseKey = responseRecord.key && typeof responseRecord.key === "object" ? responseRecord.key as Record<string, unknown> : {};
  const messageIdValue = responseKey.id ?? responseRecord.id;
  const messageId = typeof messageIdValue === "string" ? messageIdValue.slice(0, 160) : null;
  if (!messageId) {
    await updateAttempt(key, log.id, "uncertain", {
      providerStatus: response.status,
      description: `Resposta sem identificador no envio manual ao grupo ${group.name}. Não repetir sem conferir o grupo.`,
    }).catch(() => {});
    return NextResponse.json({ state: "uncertain", error: "A resposta não trouxe a confirmação do envio. Confira o grupo antes de tentar novamente." }, { status: 502 });
  }
  await updateAttempt(key, log.id, "submitted", {
    providerStatus: response.status, messageId,
    description: `A Evolution aceitou o envio manual para o grupo ${group.name}.`,
  }).catch(() => {});

  return NextResponse.json({
    state: "submitted", groupName: group.name, groupSize: group.size,
    message: "A Evolution aceitou a mensagem. Verifique o grupo; o aceite não confirma leitura pelos participantes.",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
