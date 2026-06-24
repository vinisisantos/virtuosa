import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

/**
 * READ-ONLY diagnostic endpoint (admin only).
 *
 * Cross-references recent WhatsApp contacts with the Client / SalesPipeline
 * they should have generated, so we can SEE the real DB state:
 * - is each inbox lead becoming a Client (a "person")?
 * - on which unit (instance.unit vs client.unit)?
 * - with which name (contact name vs client name)?
 * - does it have a pipeline deal?
 *
 * Makes NO writes.
 */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores" }, { status: 403 });
  }

  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "60"), 200);

    // ── Instances overview (do they have unit/userId set?) ───────────────────
    const instances = await prisma.whatsAppInstance.findMany({
      select: { name: true, unit: true, userId: true, status: true, phoneNumber: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const ownerIds = [...new Set(instances.map((i) => i.userId).filter(Boolean) as string[])];
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
    const ownerName = (id?: string | null) => owners.find((o) => o.id === id)?.name || null;

    const instancesOut = instances.map((i) => ({
      name: i.name,
      unit: i.unit,
      status: i.status,
      phoneNumber: i.phoneNumber,
      ownerUserId: i.userId,
      ownerName: ownerName(i.userId),
    }));

    // ── Recent WhatsApp contacts (the inbox leads) ───────────────────────────
    const contacts = await prisma.whatsAppContact.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { instance: { select: { name: true, unit: true, userId: true } } },
        },
      },
    });

    const leads = [];
    for (const c of contacts) {
      const conv = c.conversations[0];
      const inst = conv?.instance;
      const digits = (c.phone || "").replace(/\D/g, "");
      const tail = digits.slice(-8);

      const client = tail
        ? await prisma.client.findFirst({
            where: { phone: { contains: tail } },
            select: {
              id: true, name: true, unit: true, source: true, campaignName: true,
              stage: true, isActive: true, userId: true, createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : null;

      const pipeline = client
        ? await prisma.salesPipeline.findFirst({
            where: { clientId: client.id },
            select: { stage: true, unit: true, assignedTo: true, assignedName: true },
            orderBy: { createdAt: "desc" },
          })
        : null;

      const nameDiverges =
        !!client && !!c.name && client.name.trim().toLowerCase() !== c.name.trim().toLowerCase();
      const unitDiverges = !!client && !!inst?.unit && client.unit !== inst.unit;

      leads.push({
        contactName: c.name,
        phone: c.phone,
        contactCreatedAt: c.createdAt,
        instanceName: inst?.name || null,
        instanceUnit: inst?.unit ?? null,
        instanceOwner: ownerName(inst?.userId),
        hasClient: !!client,
        client: client
          ? {
              name: client.name, unit: client.unit, source: client.source,
              campaignName: client.campaignName, stage: client.stage,
              isActive: client.isActive, userId: client.userId, createdAt: client.createdAt,
            }
          : null,
        hasPipeline: !!pipeline,
        pipeline: pipeline
          ? { stage: pipeline.stage, unit: pipeline.unit, assignedName: pipeline.assignedName }
          : null,
        flags: {
          noClient: !client,
          nameDiverges,
          unitDiverges,
          inactiveClient: !!client && !client.isActive,
          noPipeline: !!client && !pipeline,
        },
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const clientUnitDistribution: Record<string, number> = {};
    for (const l of leads) {
      const u = l.client?.unit || "(sem cliente)";
      clientUnitDistribution[u] = (clientUnitDistribution[u] || 0) + 1;
    }

    // ── Unit distribution across the main tables (to size a Barueri migration) ──
    const KNOWN_UNITS = ["Barueri", "Osasco", "SBC", "SCS"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dist = async (model: any): Promise<Record<string, number>> => {
      const o: Record<string, number> = { Total: await model.count() };
      for (const u of KNOWN_UNITS) o[u] = await model.count({ where: { unit: u } });
      return o;
    };
    const tableUnitDistribution = {
      Clientes: await dist(prisma.client),
      Pipeline: await dist(prisma.salesPipeline),
      Atividades: await dist(prisma.activityLog),
      Agendamentos: await dist(prisma.agendamento),
      Pagamentos: await dist(prisma.payment),
      Avaliacoes: await dist(prisma.satisfactionSurvey),
      MetaLeads: await dist(prisma.metaLead),
      Campanhas: await dist(prisma.campaign),
      Instancias: await dist(prisma.whatsAppInstance),
    };

    return NextResponse.json({
      instances: instancesOut,
      summary: {
        totalContacts: leads.length,
        withoutClient: leads.filter((l) => l.flags.noClient).length,
        nameDiverges: leads.filter((l) => l.flags.nameDiverges).length,
        unitDiverges: leads.filter((l) => l.flags.unitDiverges).length,
        inactiveClients: leads.filter((l) => l.flags.inactiveClient).length,
        clientUnitDistribution,
      },
      tableUnitDistribution,
      leads,
    });
  } catch (error) {
    console.error("[CRM Diagnostico Leads]", error);
    return NextResponse.json({ error: "Falha ao gerar diagnóstico" }, { status: 500 });
  }
}
