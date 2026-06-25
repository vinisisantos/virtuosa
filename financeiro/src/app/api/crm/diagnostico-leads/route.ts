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

    // ── Instances overview — só as CONECTADAS aparecem no histórico ──────────
    // Desconectadas (pelo sistema ou pelo celular) saem da lista; voltam se
    // reconectarem. Nenhum dado/conversa é apagado.
    const instances = await prisma.whatsAppInstance.findMany({
      where: { status: "connected" },
      select: { id: true, name: true, unit: true, userId: true, status: true, phoneNumber: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const ownerIds = [...new Set(instances.map((i) => i.userId).filter(Boolean) as string[])];
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
    const ownerName = (id?: string | null) => owners.find((o) => o.id === id)?.name || null;

    // ── Por instância: nº de conversas + contatos recentes ───────────────────
    // Ajuda a identificar QUAL número é qual unidade (pelos nomes que conversam).
    const instanceIds = instances.map((i) => i.id);
    const convs = instanceIds.length
      ? await prisma.whatsAppConversation.findMany({
          where: { instanceId: { in: instanceIds } },
          select: {
            instanceId: true,
            lastMessageAt: true,
            contact: { select: { name: true, phone: true } },
          },
          orderBy: { lastMessageAt: "desc" },
        })
      : [];
    const convAgg = new Map<string, { count: number; lastAt: Date | null; samples: string[] }>();
    for (const c of convs) {
      const e = convAgg.get(c.instanceId) || { count: 0, lastAt: null, samples: [] };
      e.count++;
      if (!e.lastAt && c.lastMessageAt) e.lastAt = c.lastMessageAt;
      if (e.samples.length < 6) e.samples.push(c.contact?.name || c.contact?.phone || "—");
      convAgg.set(c.instanceId, e);
    }

    const instancesOut = instances.map((i) => {
      const agg = convAgg.get(i.id);
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        status: i.status,
        phoneNumber: i.phoneNumber,
        ownerUserId: i.userId,
        ownerName: ownerName(i.userId),
        conversationCount: agg?.count ?? 0,
        lastMessageAt: agg?.lastAt ?? null,
        sampleContacts: agg?.samples ?? [],
      };
    });

    // ── Recent WhatsApp contacts (the inbox leads) ───────────────────────────
    const contacts = await prisma.whatsAppContact.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            instance: { select: { name: true, unit: true, userId: true } },
            // 1 mensagem recebida basta p/ saber se é lead real ou contato sincronizado
            messages: { where: { fromMe: false }, take: 1, select: { id: true } },
          },
        },
      },
    });

    // ── Match clients by NORMALIZED phone (robust to formatting) ─────────────
    const normPhone = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-8);
    const allClients = await prisma.client.findMany({
      select: {
        id: true, name: true, phone: true, unit: true, source: true,
        campaignName: true, stage: true, isActive: true, userId: true, createdAt: true,
      },
    });
    const clientByPhone = new Map<string, (typeof allClients)[number]>();
    for (const cl of allClients) {
      const k = normPhone(cl.phone);
      if (k.length >= 8 && !clientByPhone.has(k)) clientByPhone.set(k, cl);
    }
    // Batch pipeline lookup for the matched clients
    const matchedIds = contacts
      .map((c) => clientByPhone.get(normPhone(c.phone))?.id)
      .filter(Boolean) as string[];
    const pipelines = matchedIds.length
      ? await prisma.salesPipeline.findMany({
          where: { clientId: { in: matchedIds } },
          select: { clientId: true, stage: true, unit: true, assignedTo: true, assignedName: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const pipelineByClient = new Map<string, (typeof pipelines)[number]>();
    for (const p of pipelines) if (!pipelineByClient.has(p.clientId)) pipelineByClient.set(p.clientId, p);

    const leads = [];
    for (const c of contacts) {
      const conv = c.conversations[0];
      const inst = conv?.instance;
      const hasInbound = (conv?.messages?.length ?? 0) > 0;

      const client = clientByPhone.get(normPhone(c.phone)) || null;
      const pipeline = client ? pipelineByClient.get(client.id) || null : null;

      const nameDiverges =
        !!client && !!c.name && client.name.trim().toLowerCase() !== c.name.trim().toLowerCase();
      const unitDiverges = !!client && !!inst?.unit && client.unit !== inst.unit;

      leads.push({
        contactName: c.name,
        phone: c.phone,
        contactCreatedAt: c.createdAt,
        hasInbound,
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
          // só é "lead perdido" se realmente recebeu mensagem e não virou pessoa
          noClient: !client && hasInbound,
          syncedContactNoMsg: !client && !hasInbound,
          nameDiverges,
          unitDiverges,
          inactiveClient: !!client && !client.isActive,
          noPipeline: !!client && hasInbound && !pipeline,
        },
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const clientUnitDistribution: Record<string, number> = {};
    for (const l of leads) {
      const u = l.client?.unit || (l.hasInbound ? "(lead sem pessoa)" : "(contato sem msg)");
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
        realLeads: leads.filter((l) => l.hasInbound).length,
        // leads que mandaram mensagem mas NÃO viraram pessoa (problema real)
        withoutClient: leads.filter((l) => l.flags.noClient).length,
        // contatos sincronizados que nunca mandaram mensagem (não são leads)
        syncedNoMsg: leads.filter((l) => l.flags.syncedContactNoMsg).length,
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
