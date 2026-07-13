import { NextRequest, NextResponse } from "next/server";
import { pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { syncLeadNameAcrossCrm } from "@/lib/whatsapp/lead-name-sync";

function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function normalizePhoneSuffix(value?: string | null) {
  return normalizePhone(value).slice(-8);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestedUnit = url.searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  try {
    const phone = url.searchParams.get("phone") || "";
    const suffix = normalizePhoneSuffix(phone);
    const unit = guard.unitFilter || requestedUnit || undefined;

    const [clientCandidates, campaigns] = await Promise.all([
      suffix.length >= 8
        ? prisma.client.findMany({
            where: {
              ...(unit ? { unit } : {}),
              phone: { contains: suffix },
            },
            select: {
              id: true,
              name: true,
              phone: true,
              campaignName: true,
              campaignId: true,
              fbclid: true,
              unit: true,
              stage: true,
              source: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      prisma.campaign.findMany({
        where: {
          ...(unit ? { unit } : {}),
          status: "ativa",
        },
        select: { name: true },
        orderBy: [{ updatedAt: "desc" }],
      }),
    ]);
    const client = pickBestCampaignClient(clientCandidates);

    return NextResponse.json({
      client,
      campaigns: [...new Set(campaigns.map((campaign) => campaign.name).filter(Boolean))],
    });
  } catch (error) {
    console.error("[GET /api/whatsapp/contact-summary]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    }
    if (name.length > 80) {
      return NextResponse.json({ error: "Nome muito longo" }, { status: 400 });
    }

    const { instances } = await getInstancesForRequest(req);
    const instanceIds = instances.map((instance) => instance.id);
    if (instanceIds.length === 0) {
      return NextResponse.json({ error: "Nenhuma instância acessível" }, { status: 403 });
    }

    const conversation = await prisma.whatsAppConversation.findFirst({
      where: {
        id: conversationId,
        instanceId: { in: instanceIds },
      },
      select: {
        contactId: true,
        contact: { select: { phone: true } },
        instance: { select: { unit: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada ou sem acesso" }, { status: 404 });
    }

    const result = await syncLeadNameAcrossCrm({
      contactId: conversation.contactId,
      name,
      phone: conversation.contact.phone,
      unit: conversation.instance.unit,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[PATCH /api/whatsapp/contact-summary]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
