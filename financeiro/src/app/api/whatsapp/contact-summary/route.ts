import { NextRequest, NextResponse } from "next/server";
import { pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

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
