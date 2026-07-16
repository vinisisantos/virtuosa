import { NextRequest, NextResponse } from "next/server";

import { resolveCampaignOfferForDeal } from "@/lib/campaign-offer";
import { prisma } from "@/lib/db";
import {
  requireUnitGuard,
  UnitAccessDeniedError,
  unitAccessDeniedResponse,
} from "@/lib/unit-guard";

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const dealId = new URL(req.url).searchParams.get("dealId")?.trim();
    if (!dealId) return NextResponse.json({ error: "Negócio obrigatório." }, { status: 400 });

    const deal = await prisma.salesPipeline.findUnique({
      where: { id: dealId },
      select: { id: true, unit: true },
    });
    if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });
    guard.enforceUnit(deal.unit);

    const offer = await resolveCampaignOfferForDeal(prisma, deal.id);
    return NextResponse.json({ offer });
  } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    console.error("[GET /api/campaigns/offer]", error);
    return NextResponse.json({ error: "Erro ao carregar a oferta da campanha." }, { status: 500 });
  }
}
