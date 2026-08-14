import { NextRequest, NextResponse } from "next/server";

import { displayCampaignName } from "@/lib/campaign-labels";
import { buildCommercialIndicators } from "@/lib/crm/commercial-indicators";
import { canViewCrmStatistics } from "@/lib/crm-statistics";
import { parseDateTimeRange, saoPauloDayRange } from "@/lib/date-filter";
import { prisma } from "@/lib/db";
import { normalizeEvaluationStatus } from "@/lib/evaluation-status";
import { getPipelineDealIdFromEvaluationNotes } from "@/lib/evaluation-scheduling";
import { requireUnitGuard } from "@/lib/unit-guard";
import { getQualifiedWhatsappLeads } from "@/lib/whatsapp/qualified-leads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const requestedUnit = req.nextUrl.searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  if (!canViewCrmStatistics(guard)) {
    return NextResponse.json({ error: "Sem permissão para estatísticas do CRM" }, { status: 403 });
  }

  const requestedRange = parseDateTimeRange(req.nextUrl.searchParams);
  const today = saoPauloDayRange();
  const range = requestedRange || { gte: today.start, lte: new Date(today.end.getTime() - 1) };
  const start = range.gte || today.start;
  const end = range.lte || new Date(today.end.getTime() - 1);

  if (start > end) {
    return NextResponse.json({ error: "Período comercial inválido." }, { status: 400 });
  }

  try {
    const qualifiedLeads = await getQualifiedWhatsappLeads({
      start,
      end,
      unit: guard.unitFilter,
    });
    const conversationIds = [...new Set(qualifiedLeads.map((lead) => lead.conversationId))];
    const clientIds = [...new Set(qualifiedLeads.map((lead) => lead.client.id))];
    const minimumReceivedAt = qualifiedLeads.reduce<Date | null>((minimum, lead) => (
      !minimum || lead.receivedAt < minimum ? lead.receivedAt : minimum
    ), null);

    const [messages, pipelineDeals] = await Promise.all([
      conversationIds.length > 0 && minimumReceivedAt
        ? prisma.whatsAppMessage.findMany({
            where: {
              conversationId: { in: conversationIds },
              timestamp: { gte: minimumReceivedAt },
            },
            select: {
              conversationId: true,
              fromMe: true,
              timestamp: true,
            },
            orderBy: { timestamp: "asc" },
          })
        : Promise.resolve([]),
      clientIds.length > 0
        ? prisma.salesPipeline.findMany({
            where: {
              clientId: { in: clientIds },
              ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
            },
            select: { id: true, clientId: true },
          })
        : Promise.resolve([]),
    ]);

    const dealIds = new Set(pipelineDeals.map((deal) => deal.id));
    const clientIdByDealId = new Map(pipelineDeals.map((deal) => [deal.id, deal.clientId]));
    const appointmentCandidates = qualifiedLeads.length > 0 && minimumReceivedAt
      ? await prisma.agendamento.findMany({
          where: {
            procedimento: { contains: "avalia", mode: "insensitive" },
            ...(guard.unitFilter ? { unit: guard.unitFilter } : {}),
            createdAt: { gte: minimumReceivedAt },
          },
          select: {
            notes: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];

    let appointmentsWithMarker = 0;
    let appointmentsWithoutMarker = 0;
    let appointmentsLinkedToCohort = 0;
    const linkedAppointments = appointmentCandidates.flatMap((appointment) => {
      const dealId = getPipelineDealIdFromEvaluationNotes(appointment.notes);
      const createdInSelectedRange = appointment.createdAt >= start && appointment.createdAt <= end;
      if (!dealId) {
        if (createdInSelectedRange) appointmentsWithoutMarker += 1;
        return [];
      }
      if (createdInSelectedRange) appointmentsWithMarker += 1;
      if (!dealIds.has(dealId)) return [];
      const clientId = clientIdByDealId.get(dealId);
      if (!clientId) return [];
      appointmentsLinkedToCohort += 1;
      return [{
        clientId,
        status: normalizeEvaluationStatus(appointment.status),
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
      }];
    });

    const indicators = buildCommercialIndicators({
      leads: qualifiedLeads.map((lead) => ({
        key: `${lead.conversationId}:${lead.receivedAt.toISOString()}:${lead.client.id}`,
        clientId: lead.client.id,
        conversationId: lead.conversationId,
        receivedAt: lead.receivedAt,
        campaignLabel: displayCampaignName(lead.client.campaignName),
        assigneeLabel: lead.assignedToName || (lead.assignedTo ? "Responsável sem nome" : "Sem responsável"),
      })),
      messages,
      appointments: linkedAppointments,
    });

    return NextResponse.json(
      {
        ...indicators,
        coverage: {
          ...indicators.coverage,
          appointmentsWithMarker,
          appointmentsWithoutMarker,
          appointmentsLinkedToCohort,
        },
        range: { start: start.toISOString(), end: end.toISOString() },
        unit: guard.unitFilter || "Todas",
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
    );
  } catch (error) {
    console.error("[CRM Estatistica Comercial]", error);
    return NextResponse.json({ error: "Falha ao carregar indicadores comerciais" }, { status: 500 });
  }
}
