import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ── Fuso horário ────────────────────────────────────────────────────────────
// O Brasil aboliu o horário de verão em 2019 → offset fixo de -03:00.
// Usamos São Paulo de forma consistente nos cards E no gráfico de 30 dias,
// para "hoje/ontem" baterem (antes os cards usavam a hora do servidor e o
// gráfico usava UTC, divergindo um do outro).
const SP_TZ = "America/Sao_Paulo";
const SP_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Chave de data (YYYY-MM-DD) no fuso de São Paulo para um instante. */
function spDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Instante (UTC) da meia-noite de São Paulo de uma data YYYY-MM-DD. */
function spMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00${SP_OFFSET}`);
}

function normalizedPhoneKey(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

function isClickToWhatsappLead(client: { source: string | null; fbclid: string | null }) {
  const adUrl = client.fbclid || "";
  return (
    client.source === "facebook_ad" ||
    /(?:fb\.me|wa\.me|wamo\/status\/preview|instagram\.com\/p\/)/i.test(adUrl)
  );
}

// Fallback de rótulo/cor para deals legados (sem stageId → string `stage`).
const LEGACY_STAGE_LABELS: Record<string, string> = {
  novo_lead: "Novo Lead",
  em_atendimento: "Em Atendimento",
  enviado: "Enviado",
  agendado: "Agendado",
  em_negociacao: "Em Negociação",
  fechado: "Fechado",
  perdido: "Perdido",
};
const LEGACY_STAGE_COLORS: Record<string, string> = {
  novo_lead: "#8b5cf6",
  em_atendimento: "#3b82f6",
  enviado: "#06b6d4",
  agendado: "#a855f7",
  em_negociacao: "#f59e0b",
  fechado: "#22c55e",
  perdido: "#ef4444",
};
const LEGACY_STAGE_ORDER: Record<string, number> = {
  novo_lead: 0,
  em_atendimento: 1,
  enviado: 2,
  agendado: 3,
  em_negociacao: 4,
  fechado: 5,
  perdido: 6,
};

export async function GET(req: NextRequest) {
  const urlUnit = req.nextUrl.searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit: urlUnit });
  if (guard instanceof NextResponse) return guard;

  const queryUserId = req.nextUrl.searchParams.get("userId");
  const targetUserId = guard.isAdmin && queryUserId ? queryUserId : guard.userId;
  const isUserFiltered = !guard.isAdmin || !!queryUserId;
  const unitFilter = guard.unitFilter; // string | undefined (já validado pelo guard)

    try {
      const now = new Date();
      const todayStart = spMidnight(spDateKey(now));
      
      const monthStartSPKey = spDateKey(now).substring(0, 8) + "01";
      const monthStart = spMidnight(monthStartSPKey);

      // ── Filtros de conversa (usuário + unidade) ──────────────────────────────
    // A unidade da conversa vem da instância de WhatsApp (instance.unit), que é
    // a fonte de verdade da separação por unidade. Antes os cards de WhatsApp
    // ignoravam a unidade; agora respeitam, igual ao Pipeline/Atividade.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convConds: any = {};
    if (isUserFiltered) convConds.assignedTo = targetUserId;
    if (unitFilter) convConds.instance = { unit: unitFilter };
    const hasConvFilter = isUserFiltered || !!unitFilter;

    const unitWhere = unitFilter ? { unit: unitFilter } : {};
    const pipelineWhere = {
      ...unitWhere,
      ...(isUserFiltered ? { assignedTo: targetUserId } : {}),
    };
    const activityWhere = {
      ...unitWhere,
      ...(isUserFiltered ? { userId: targetUserId } : {}),
    };

    const [
      activeConversations,
      activeConversationsBeforeToday,
      unreadConversations,
      openDeals,
      wonDeals,
      pipelineGroups,
      leadsSeries,
    ] = await Promise.all([
      // "Conversas Ativas" = total de conversas abertas (agora).
      prisma.whatsAppConversation.count({ where: { ...convConds, status: "open" } }),
      // Abertas criadas ANTES de hoje → para o delta "novas hoje" (current - this).
      prisma.whatsAppConversation.count({
        where: { ...convConds, status: "open", createdAt: { lt: todayStart } },
      }),
      // "Aguardando Resposta" = conversas abertas com mensagens não lidas.
      prisma.whatsAppConversation.count({
        where: { ...convConds, status: "open", unreadCount: { gt: 0 } },
      }),
      prisma.salesPipeline.aggregate({
        where: { ...pipelineWhere, stage: { notIn: ["fechado", "perdido"] } },
        _sum: { value: true },
        _count: true,
      }),
      // "Negócios Ganhos" = pipeline fechado a partir do primeiro dia do mês.
      prisma.salesPipeline.aggregate({
        where: { ...pipelineWhere, stage: "fechado", closedAt: { gte: monthStart } },
        _sum: { value: true },
        _count: true,
      }),
      // Pipeline por estágio: agrupa pelo stageId (etapa real do funil), com
      // fallback para a string `stage` em deals legados sem stageId.
      prisma.salesPipeline.groupBy({
        by: ["stageId", "stage"],
        where: pipelineWhere,
        _count: true,
        _sum: { value: true },
      }),
      getLeadsSeries(30, { isUserFiltered, targetUserId, unitFilter }),
    ]);

    // ── Resolver as etapas reais (PipelineStage) para nome/cor/ordem ──────────
    const stageIds = [...new Set(pipelineGroups.map((g) => g.stageId).filter(Boolean))] as string[];
    const stageRows = stageIds.length
      ? await prisma.pipelineStage.findMany({
          where: { id: { in: stageIds } },
          select: { id: true, name: true, color: true, position: true },
        })
      : [];
    const stageMeta = new Map(stageRows.map((s) => [s.id, s]));

    // Mescla os grupos por etapa de exibição (prefere PipelineStage; senão, legado).
    const pipelineMap = new Map<
      string,
      { stage: string; label: string; color: string; position: number; count: number; value: number }
    >();
    for (const g of pipelineGroups) {
      const meta = g.stageId ? stageMeta.get(g.stageId) : undefined;
      const key = meta ? meta.id : g.stage || "sem_etapa";
      const label = meta?.name || LEGACY_STAGE_LABELS[g.stage] || g.stage || "Sem etapa";
      const color = meta?.color || LEGACY_STAGE_COLORS[g.stage] || "#6b7280";
      const position = meta?.position ?? LEGACY_STAGE_ORDER[g.stage] ?? 999;
      const entry =
        pipelineMap.get(key) || { stage: key, label, color, position, count: 0, value: 0 };
      entry.count += g._count;
      entry.value += g._sum.value || 0;
      pipelineMap.set(key, entry);
    }
    const pipeline = [...pipelineMap.values()]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ stage: e.stage, label: e.label, count: e.count, value: e.value, color: e.color }));

    return NextResponse.json({
      metrics: {
        activeConversations: { current: activeConversations, previous: activeConversationsBeforeToday },
        unreadConversations,
        openDealsValue: openDeals._sum.value || 0,
        openDealsCount: openDeals._count || 0,
        wonDealsValue: wonDeals._sum.value || 0,
        wonDealsCount: wonDeals._count || 0,
      },
      pipeline,
      leadsSeries,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    console.error("[CRM Dashboard API]", error);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}

async function getLeadsSeries(
  days: number,
  filters: { isUserFiltered: boolean; targetUserId: string; unitFilter?: string },
) {
  const { isUserFiltered, targetUserId, unitFilter } = filters;
  const now = new Date();
  const todayStart = spMidnight(spDateKey(now));
  const start = new Date(todayStart.getTime() - (days - 1) * DAY_MS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientConds: any = {
    OR: [
      { arrivedAt: { gte: start } },
      { arrivedAt: null, createdAt: { gte: start } },
    ],
  };
  if (isUserFiltered) clientConds.userId = targetUserId;
  if (unitFilter) clientConds.unit = unitFilter;

  const clients = await prisma.client.findMany({
    where: clientConds,
    select: { id: true, phone: true, source: true, fbclid: true, arrivedAt: true, createdAt: true },
  });

  const dateMap: Record<string, { newLeads: number }> = {};
  const countedKeys = new Set<string>();
  for (let d = 0; d < days; d++) {
    const key = spDateKey(new Date(start.getTime() + d * DAY_MS));
    dateMap[key] = { newLeads: 0 };
  }
  for (const client of clients) {
    if (!isClickToWhatsappLead(client)) continue;

    const leadDate = client.arrivedAt || client.createdAt;
    const key = spDateKey(new Date(leadDate));
    const dedupeKey = `${key}:${normalizedPhoneKey(client.phone) || client.id}`;
    if (countedKeys.has(dedupeKey)) continue;
    countedKeys.add(dedupeKey);

    if (dateMap[key]) {
      dateMap[key].newLeads++;
    }
  }
  return Object.entries(dateMap).map(([date, counts]) => ({ date, ...counts }));
}
