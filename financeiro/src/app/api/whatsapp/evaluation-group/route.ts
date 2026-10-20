import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminRole } from "@/lib/role-access";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { discoverEvaluationNoticeGroups, fetchEvaluationNoticeGroups } from "@/lib/whatsapp/evaluation-group-directory";
import {
  getEvaluationGroupUnitConfig, isEvaluationGroupJid, isEvaluationGroupName, parseEvaluationGroupConfig,
} from "@/lib/whatsapp/evaluation-group-notice-config";

export const dynamic = "force-dynamic";

async function access(req: NextRequest, management = false) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const scope = getEvaluationGroupUnitConfig(req.nextUrl.searchParams.get("unit"));
  if (!scope || req.nextUrl.searchParams.get("targetInstanceId") !== scope.instanceId) {
    return NextResponse.json({ error: "Selecione a unidade e a caixa autorizadas para os avisos ao grupo." }, { status: 403 });
  }
  const { instances } = await getInstancesForRequest(req);
  const instance = instances.find(candidate => candidate.id === scope.instanceId
    && candidate.unit === scope.unit && candidate.canView === true);
  if (!instance) return NextResponse.json({ error: `Sem acesso à caixa ${scope.instanceDisplayName}.` }, { status: 403 });
  const canManage = isAdminRole(req.headers.get("x-user-role")) && instance.canReply === true;
  if (management && !canManage) return NextResponse.json({ error: "Somente administradores autorizados podem configurar o grupo." }, { status: 403 });
  return { userId, instance, canManage, scope };
}

export async function GET(req: NextRequest) {
  try {
    const allowed = await access(req);
    if (allowed instanceof NextResponse) return allowed;
    const [setting, notices] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: allowed.scope.settingKey }, select: { value: true } }),
      prisma.whatsAppEvaluationGroupNotice.findMany({
        where: { instanceId: allowed.scope.instanceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
        select: { id: true, eventType: true, clientName: true, clientPhone: true, evaluationProcedure: true, startTime: true, previousStartTime: true,
          state: true, createdAt: true, submittedAt: true, lastError: true, groupName: true },
      }),
    ]);
    const config = parseEvaluationGroupConfig(setting?.value, allowed.scope.unit);
    return NextResponse.json({ config, notices, canManage: allowed.canManage, connected: allowed.instance.status === "connected" }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os avisos do grupo. Tente novamente." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await access(req, true);
    if (allowed instanceof NextResponse) return allowed;
    const { scope } = allowed;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    if (body.action !== "discover" && body.action !== "configure") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    if (body.action === "discover" || body.enabled === true) {
      if (allowed.instance.status !== "connected" || allowed.instance.provider !== "evolution") {
        return NextResponse.json({ error: `Conecte a ${scope.instanceDisplayName} na Evolution antes de conferir o grupo.` }, { status: 409 });
      }
    }
    if (body.action === "discover") {
      const discovery = scope.unit === "Osasco"
        ? await discoverEvaluationNoticeGroups(allowed.instance.name, undefined, scope.unit)
        : { groups: await fetchEvaluationNoticeGroups(allowed.instance.name, undefined, scope.unit) };
      return NextResponse.json(discovery, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Informe se deseja ativar ou pausar." }, { status: 400 });
    let verifiedGroup: { id: string; name: string } | null = null;
    if (body.enabled) {
      if (body.confirmTeamAccess !== true || !isEvaluationGroupJid(body.groupJid)) {
        return NextResponse.json({ error: "Selecione o grupo e confirme que a equipe está autorizada a receber os dados." }, { status: 400 });
      }
      const groups = await fetchEvaluationNoticeGroups(allowed.instance.name, undefined, scope.unit);
      const selectedGroup = groups.find(group => group.id === body.groupJid && isEvaluationGroupName(group.name, scope.unit));
      verifiedGroup = selectedGroup || null;
      if (!verifiedGroup) return NextResponse.json({ error: `O grupo selecionado não foi encontrado na ${scope.instanceDisplayName}. Consulte novamente.` }, { status: 409 });
      if (scope.unit === "Osasco" && selectedGroup?.announce) {
        return NextResponse.json({ error: "O grupo permite envio somente por administradores. A permissão da caixa precisa ser conferida antes da ativação." }, { status: 409 });
      }
    }
    const config = await prisma.$transaction(async tx => {
      // Serializa a ativação/pausa sem bloquear transações de agenda durante HTTP.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope.settingKey}))`;
      const previousRow = await tx.appSetting.findUnique({ where: { key: scope.settingKey }, select: { value: true } });
      const previous = parseEvaluationGroupConfig(previousRow?.value, scope.unit);
      if (!body.enabled && !previous) return null;
      const sameActiveDestination = previous?.enabled && previous.groupJid === verifiedGroup?.id;
      const activatedAt = sameActiveDestination ? previous.activatedAt : new Date().toISOString();
      const eventCutoff = (value?: string) => value
        ? (sameActiveDestination ? value : activatedAt)
        : scope.unit === "Osasco" ? activatedAt : undefined;
      const confirmationsActivatedAt = eventCutoff(previous?.confirmationsActivatedAt);
      const cancellationsActivatedAt = eventCutoff(previous?.cancellationsActivatedAt);
      const reschedulesActivatedAt = eventCutoff(previous?.reschedulesActivatedAt);
      const next = body.enabled ? {
        enabled: true, instanceId: scope.instanceId,
        groupJid: verifiedGroup!.id, groupName: scope.groupName,
        activatedAt, approvedBy: allowed.userId,
        // SBC mantém seus gates operacionais; Osasco só os cria nesta ativação explícita.
        ...(confirmationsActivatedAt ? { confirmationsActivatedAt } : {}),
        ...(cancellationsActivatedAt ? { cancellationsActivatedAt } : {}),
        ...(reschedulesActivatedAt ? { reschedulesActivatedAt } : {}),
      } : { ...previous!, enabled: false };
      await tx.appSetting.upsert({ where: { key: scope.settingKey },
        create: { key: scope.settingKey, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
      await tx.activityLog.create({ data: {
        userId: allowed.userId, userName: req.headers.get("x-user-name") || "Administrador",
        action: body.enabled ? "evaluation_group_enabled" : "evaluation_group_paused", entityType: "WhatsAppEvaluationGroup",
        entityId: scope.instanceId, unit: scope.unit,
        description: body.enabled ? `Ativados avisos de novas avaliações no grupo ${scope.groupName}.` : `Pausados avisos de avaliações ao grupo ${scope.unit}.`,
        metadata: JSON.stringify({ groupJid: next.groupJid, activatedAt: next.activatedAt, confirmTeamAccess: body.enabled }),
      } });
      return next;
    });
    return NextResponse.json({ config, success: true });
  } catch (error) {
    const expected = error instanceof Error && /Evolution|consultar o grupo|conexão com/.test(error.message);
    return NextResponse.json({ error: expected ? error.message : "Não foi possível salvar a configuração. Nenhum envio de teste foi realizado." }, { status: expected ? 502 : 500 });
  }
}
