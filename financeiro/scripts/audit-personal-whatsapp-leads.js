const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const COMMERCIAL_UNITS = new Set(["Osasco", "SBC", "SCS"]);
const CONFIRM_TOKEN = "remove-personal-whatsapp-leads";

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function phoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return national.length >= 10 ? national.slice(-11) : national;
}

function normalizeStage(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function isNovoLeadDeal(deal) {
  return normalizeStage(deal.stage) === "novo_lead" || normalizeStage(deal.pipelineStage?.name) === "novo_lead";
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || "sem_valor";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function compactCandidate(candidate) {
  return {
    dealId: candidate.dealId,
    clientId: candidate.clientId,
    name: candidate.clientName,
    phone: candidate.phone,
    clientUnit: candidate.clientUnit,
    originUnit: candidate.originUnit,
    dealUnit: candidate.dealUnit,
    source: candidate.source,
    campaignName: candidate.campaignName,
    dealCreatedAt: candidate.dealCreatedAt,
    conversations: candidate.conversations.map((conversation) => ({
      instanceName: conversation.instanceName,
      instanceUnit: conversation.instanceUnit,
      ownerName: conversation.ownerName,
    })),
  };
}

function compactReport(report, limit) {
  const candidates = report.candidates.map(compactCandidate);
  const cappedCandidates = Number.isFinite(limit) && limit >= 0 ? candidates.slice(0, limit) : candidates;
  const osascoCandidates = report.candidates.filter((candidate) => candidate.dealUnit === "Osasco");

  return {
    summary: {
      ...report.summary,
      omittedCandidates: candidates.length - cappedCandidates.length,
    },
    impact: {
      byDealUnit: countBy(report.candidates, (candidate) => candidate.dealUnit),
      byOriginUnit: countBy(report.candidates, (candidate) => candidate.originUnit),
      osascoNovoLeadInflation: osascoCandidates.length,
      osascoWonConversionInflation: 0,
    },
    candidates: cappedCandidates,
  };
}

function cleanCell(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? cleanCell(value).slice(0, 10) : date.toISOString().slice(0, 10);
}

function formatTable(output) {
  const rows = [
    `mode=${output.mode}`,
    `instance=${output.instances.map((instance) => `${instance.name}/${instance.unit}/${instance.user?.email || ""}`).join(", ")}`,
    `personalConversations=${output.summary.personalConversations}`,
    `matchedClients=${output.summary.matchedClients}`,
    `matchedNovoLeadDeals=${output.summary.matchedNovoLeadDeals}`,
    `candidates=${output.summary.candidates}`,
    `impactByDealUnit=${JSON.stringify(output.impact?.byDealUnit || {})}`,
    `osascoNovoLeadInflation=${output.impact?.osascoNovoLeadInflation ?? 0}`,
    "",
    ["#", "date", "dealUnit", "clientUnit", "originUnit", "name", "phone", "dealId", "clientId"].join("\t"),
  ];

  output.candidates.forEach((candidate, index) => {
    rows.push(
      [
        index + 1,
        formatDate(candidate.dealCreatedAt),
        cleanCell(candidate.dealUnit),
        cleanCell(candidate.clientUnit),
        cleanCell(candidate.originUnit),
        cleanCell(candidate.name),
        cleanCell(candidate.phone),
        cleanCell(candidate.dealId),
        cleanCell(candidate.clientId),
      ].join("\t")
    );
  });

  return rows.join("\n");
}

async function resolvePersonalInstances(instanceId) {
  const where = instanceId
    ? { id: instanceId }
    : {
        unit: "Todas",
        user: { role: "ADMINISTRADOR" },
      };

  return prisma.whatsAppInstance.findMany({
    where,
    select: {
      id: true,
      name: true,
      unit: true,
      phoneNumber: true,
      userId: true,
      user: { select: { name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function buildReport(instanceIds) {
  const personalConversations = await prisma.whatsAppConversation.findMany({
    where: { instanceId: { in: instanceIds } },
    select: {
      id: true,
      instanceId: true,
      createdAt: true,
      lastMessageAt: true,
      contact: { select: { id: true, phone: true, name: true } },
      instance: { select: { id: true, name: true, unit: true, phoneNumber: true, user: { select: { name: true, email: true, role: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const phoneKeys = [...new Set(personalConversations.map((conversation) => phoneKey(conversation.contact.phone)).filter(Boolean))];
  if (!phoneKeys.length) return { candidates: [], summary: { personalConversations: personalConversations.length } };

  const [clients, deals, allConversations] = await Promise.all([
    prisma.client.findMany({
      where: { OR: phoneKeys.map((key) => ({ phone: { contains: key.slice(-8) } })) },
      select: {
        id: true,
        name: true,
        phone: true,
        unit: true,
        originUnit: true,
        source: true,
        campaignName: true,
        totalSpent: true,
        visitCount: true,
        stage: true,
        createdAt: true,
        arrivedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.salesPipeline.findMany({
      where: {
        closedAt: null,
        lostReason: null,
      },
      select: {
        id: true,
        clientId: true,
        clientName: true,
        stage: true,
        unit: true,
        source: true,
        createdAt: true,
        pipelineStage: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.whatsAppConversation.findMany({
      where: {
        contact: { OR: phoneKeys.map((key) => ({ phone: { contains: key.slice(-8) } })) },
      },
      select: {
        id: true,
        instanceId: true,
        createdAt: true,
        contact: { select: { phone: true } },
        instance: { select: { id: true, name: true, unit: true, phoneNumber: true, user: { select: { name: true, email: true, role: true } } } },
      },
    }),
  ]);

  const clientsByPhone = groupBy(clients, (client) => phoneKey(client.phone));
  const dealsByClient = groupBy(deals.filter(isNovoLeadDeal), (deal) => deal.clientId);
  const conversationsByPhone = groupBy(allConversations, (conversation) => phoneKey(conversation.contact.phone));

  const clientIds = clients.map((client) => client.id);
  const clientNames = [...new Set(clients.map((client) => client.name).filter(Boolean))];
  const clientPhones = [...new Set(clients.map((client) => client.phone).filter(Boolean))];

  const [
    packages,
    payments,
    agendamentosByPhone,
    agendamentosByName,
    atendimentos,
    photos,
    loyalty,
    contracts,
    otherDeals,
  ] = await Promise.all([
    clientIds.length
      ? prisma.package.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, clientName: true, status: true } })
      : [],
    clientNames.length
      ? prisma.payment.findMany({ where: { clientName: { in: clientNames } }, select: { clientName: true, status: true, amount: true } })
      : [],
    clientPhones.length
      ? prisma.agendamento.findMany({ where: { OR: clientPhones.map((phone) => ({ clientPhone: { contains: phoneKey(phone)?.slice(-8) || phone } })) }, select: { clientPhone: true, clientName: true, status: true, procedimento: true } })
      : [],
    clientNames.length
      ? prisma.agendamento.findMany({ where: { clientName: { in: clientNames } }, select: { clientPhone: true, clientName: true, status: true, procedimento: true } })
      : [],
    clientIds.length
      ? prisma.atendimento.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, status: true } })
      : [],
    clientIds.length
      ? prisma.clientPhoto.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, procedimento: true } })
      : [],
    clientIds.length
      ? prisma.loyaltyTransaction.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, reason: true } })
      : [],
    clientNames.length
      ? prisma.digitalContract.findMany({ where: { clientName: { in: clientNames } }, select: { clientName: true, status: true } })
      : [],
    clientIds.length
      ? prisma.salesPipeline.findMany({
          where: { clientId: { in: clientIds } },
          select: { id: true, clientId: true, stage: true, closedAt: true, lostReason: true },
        })
      : [],
  ]);

  const commercialSignalsByClientId = new Map();
  const addSignal = (clientId, signal) => {
    const list = commercialSignalsByClientId.get(clientId) || [];
    list.push(signal);
    commercialSignalsByClientId.set(clientId, list);
  };

  for (const item of packages) if (item.clientId) addSignal(item.clientId, `package:${item.status}`);
  for (const item of atendimentos) addSignal(item.clientId, `atendimento:${item.status}`);
  for (const item of photos) addSignal(item.clientId, `photo:${item.procedimento}`);
  for (const item of loyalty) addSignal(item.clientId, `loyalty:${item.reason}`);
  for (const deal of otherDeals) {
    if (!isNovoLeadDeal(deal) || deal.closedAt || deal.lostReason) addSignal(deal.clientId, `pipeline:${deal.stage}`);
  }

  const clientIdByName = new Map(clients.map((client) => [client.name, client.id]));
  for (const item of payments) {
    const clientId = clientIdByName.get(item.clientName);
    if (clientId) addSignal(clientId, `payment:${item.status}`);
  }
  for (const item of contracts) {
    const clientId = clientIdByName.get(item.clientName);
    if (clientId) addSignal(clientId, `contract:${item.status}`);
  }
  for (const item of [...agendamentosByPhone, ...agendamentosByName]) {
    const key = phoneKey(item.clientPhone);
    const matchedClients = key ? clientsByPhone.get(key) || [] : clients.filter((client) => client.name === item.clientName);
    for (const client of matchedClients) addSignal(client.id, `agendamento:${item.status}:${item.procedimento}`);
  }

  const candidates = [];
  const personalInstanceIdSet = new Set(instanceIds);
  for (const [key, matchedClients] of clientsByPhone.entries()) {
    const phoneConversations = conversationsByPhone.get(key) || [];
    const hasOnlyPersonalConversations =
      phoneConversations.length > 0 &&
      phoneConversations.every((conversation) => personalInstanceIdSet.has(conversation.instanceId));
    const hasCommercialConversation = phoneConversations.some((conversation) => COMMERCIAL_UNITS.has(conversation.instance.unit || ""));
    if (!hasOnlyPersonalConversations || hasCommercialConversation) continue;

    for (const client of matchedClients) {
      const clientDeals = dealsByClient.get(client.id) || [];
      if (!clientDeals.length) continue;

      const signals = commercialSignalsByClientId.get(client.id) || [];
      const hasClientCommercialNumbers = Number(client.totalSpent || 0) > 0 || Number(client.visitCount || 0) > 0 || client.stage === "venda";
      if (signals.length || hasClientCommercialNumbers) continue;

      for (const deal of clientDeals) {
        candidates.push({
          dealId: deal.id,
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          clientUnit: client.unit,
          originUnit: client.originUnit,
          dealUnit: deal.unit,
          source: deal.source,
          campaignName: client.campaignName,
          clientCreatedAt: client.createdAt,
          dealCreatedAt: deal.createdAt,
          conversations: phoneConversations.map((conversation) => ({
            id: conversation.id,
            instanceId: conversation.instanceId,
            instanceName: conversation.instance.name,
            instanceUnit: conversation.instance.unit,
            ownerName: conversation.instance.user?.name || null,
          })),
        });
      }
    }
  }

  return {
    candidates,
    summary: {
      personalConversations: personalConversations.length,
      matchedClients: clients.length,
      matchedNovoLeadDeals: deals.filter(isNovoLeadDeal).length,
      candidates: candidates.length,
    },
  };
}

async function applyCleanup(candidates, options) {
  const dealIds = [...new Set(candidates.map((candidate) => candidate.dealId))];
  const clientIds = [...new Set(candidates.map((candidate) => candidate.clientId))];

  const deletedDeals = dealIds.length
    ? await prisma.salesPipeline.deleteMany({ where: { id: { in: dealIds } } })
    : { count: 0 };

  const remainingDeals = clientIds.length
    ? await prisma.salesPipeline.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true } })
    : [];
  const clientsWithDeals = new Set(remainingDeals.map((deal) => deal.clientId));
  const orphanClientIds = clientIds.filter((clientId) => !clientsWithDeals.has(clientId));
  const deletedClients = orphanClientIds.length
    ? await prisma.client.deleteMany({ where: { id: { in: orphanClientIds } } })
    : { count: 0 };

  let disabledInstances = { count: 0 };
  if (options.disableCapture && options.instanceIds.length) {
    disabledInstances = await prisma.whatsAppInstance.updateMany({
      where: { id: { in: options.instanceIds } },
      data: { capturesLeads: false },
    });
  }

  return { deletedDeals: deletedDeals.count, deletedClients: deletedClients.count, disabledInstances: disabledInstances.count };
}

async function main() {
  const instanceId = argValue("instance-id");
  const apply = hasFlag("apply");
  const compact = hasFlag("compact");
  const table = hasFlag("table");
  const limit = Number.parseInt(argValue("limit") || "", 10);
  const disableCapture = hasFlag("disable-capture");
  const confirm = argValue("confirm");

  if (apply && confirm !== CONFIRM_TOKEN) {
    throw new Error(`Para aplicar, use --apply --confirm=${CONFIRM_TOKEN}`);
  }

  const instances = await resolvePersonalInstances(instanceId);
  if (!instances.length) {
    console.log(JSON.stringify({ error: "Nenhuma instancia pessoal/admin encontrada", candidates: [] }, null, 2));
    return;
  }

  if (!instanceId && instances.length > 1) {
    console.log(JSON.stringify({
      error: "Mais de uma instancia admin/Todas encontrada; informe --instance-id=<id>",
      instances,
    }, null, 2));
    return;
  }

  const instanceIds = instances.map((instance) => instance.id);
  const report = await buildReport(instanceIds);
  const renderedReport = compact || table ? compactReport(report, limit) : report;
  const output = {
    mode: apply ? "apply" : "dry-run",
    instances,
    summary: renderedReport.summary,
    ...(compact || table ? { impact: renderedReport.impact } : {}),
    candidates: renderedReport.candidates,
  };

  if (apply) {
    output.applied = await applyCleanup(report.candidates, { disableCapture, instanceIds });
  }

  console.log(table ? formatTable(output) : JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
