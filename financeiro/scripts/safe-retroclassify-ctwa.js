#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

function normalizeCampaignText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGenericCampaignName(value) {
  const normalized = normalizeCampaignText(value);
  return (
    !normalized ||
    normalized === "sem campanha classificada" ||
    normalized === "converse conosco" ||
    normalized === "desconhecido" ||
    normalized === "desconhecida" ||
    normalized === "anuncio no status" ||
    normalized.startsWith("campanha desconhecida")
  );
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneKey(value) {
  const digits = digitsOnly(value);
  return digits.length >= 8 ? digits.slice(-8) : null;
}

function parseArgs(argv) {
  const args = { unit: "SCS", limit: 200, apply: false, useDirectUrl: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--use-direct-url") args.useDirectUrl = true;
    else if (arg.startsWith("--unit=")) args.unit = arg.slice("--unit=".length).trim();
    else if (arg.startsWith("--limit=")) args.limit = Math.max(1, Math.min(Number(arg.slice("--limit=".length)) || 200, 1000));
  }
  return args;
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function readLogEvidence(log) {
  const payload = safeJson(log.payload);
  if (!payload) return null;

  const campaignName = [
    payload.detectedCampaign,
    payload.keywordCampaignName,
    payload.managedCampaignName,
  ].find((value) => typeof value === "string" && !isGenericCampaignName(value));
  if (!campaignName) return null;

  const sourceId = payload.adId || payload.adReplyRaw?.sourceId || null;
  const sourceUrl = payload.adSourceUrl || payload.adReplyRaw?.sourceUrl || null;
  const hasAdEvidence = !!sourceId || !!sourceUrl || payload.hasExternalAdReply === true || payload.hasAdReply === true;
  if (!hasAdEvidence) return null;

  return {
    campaignName,
    campaignId: sourceId || null,
    sourceUrl: sourceUrl || null,
    source: "ctwa_diag",
    createdAt: log.createdAt,
  };
}

function chooseSingleCampaign(evidences) {
  const usable = evidences.filter(Boolean);
  if (usable.length === 0) return { evidence: null, conflict: false };

  const campaigns = new Map();
  for (const evidence of usable) {
    const key = normalizeCampaignText(evidence.campaignName);
    if (!campaigns.has(key)) campaigns.set(key, evidence);
  }

  if (campaigns.size > 1) {
    return { evidence: null, conflict: true, campaigns: [...campaigns.values()].map((item) => item.campaignName) };
  }

  return { evidence: [...campaigns.values()][0], conflict: false };
}

async function main(args) {
  const unit = args.unit || undefined;

  const allClients = await prisma.client.findMany({
    where: {
      isActive: true,
      ...(unit ? { unit } : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      unit: true,
      source: true,
      campaignName: true,
      campaignId: true,
      fbclid: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const clientsByPhone = new Map();
  for (const client of allClients) {
    const key = phoneKey(client.phone);
    if (!key) continue;
    const list = clientsByPhone.get(key) || [];
    list.push(client);
    clientsByPhone.set(key, list);
  }

  const genericCtwaClients = allClients
    .filter((client) => client.source === "facebook_ad" && isGenericCampaignName(client.campaignName))
    .slice(0, args.limit);

  const logs = await prisma.webhookLog.findMany({
    where: { source: "whatsapp_ad", eventType: "ctwa_diag" },
    select: { payload: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const logsByPhone = new Map();
  for (const log of logs) {
    const payload = safeJson(log.payload);
    const key = phoneKey(payload?.phone);
    if (!key) continue;
    const evidence = readLogEvidence(log);
    if (!evidence) continue;
    const list = logsByPhone.get(key) || [];
    list.push(evidence);
    logsByPhone.set(key, list);
  }

  const results = [];
  for (const client of genericCtwaClients) {
    const key = phoneKey(client.phone);
    if (!key) {
      results.push({ id: client.id, name: client.name, phone: client.phone, action: "skipped", reason: "missing_phone_key" });
      continue;
    }

    const duplicateEvidence = (clientsByPhone.get(key) || [])
      .filter((candidate) => candidate.id !== client.id)
      .filter((candidate) => !isGenericCampaignName(candidate.campaignName))
      .filter((candidate) => candidate.source === "facebook_ad" || !!candidate.campaignId || !!candidate.fbclid)
      .map((candidate) => ({
        campaignName: candidate.campaignName,
        campaignId: candidate.campaignId || null,
        sourceUrl: candidate.fbclid || null,
        source: "duplicate_client",
        duplicateClientId: candidate.id,
      }));

    const logEvidence = logsByPhone.get(key) || [];
    const decision = chooseSingleCampaign([...duplicateEvidence, ...logEvidence]);

    if (decision.conflict) {
      results.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        action: "skipped",
        reason: "campaign_conflict",
        campaigns: decision.campaigns,
      });
      continue;
    }

    if (!decision.evidence) {
      results.push({ id: client.id, name: client.name, phone: client.phone, action: "skipped", reason: "no_safe_evidence" });
      continue;
    }

    if (args.apply) {
      try {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            source: "facebook_ad",
            campaignName: decision.evidence.campaignName,
            ...(decision.evidence.campaignId && !client.campaignId ? { campaignId: decision.evidence.campaignId } : {}),
            ...(decision.evidence.sourceUrl && !client.fbclid ? { fbclid: decision.evidence.sourceUrl } : {}),
          },
        });
      } catch (error) {
        results.push({
          id: client.id,
          name: client.name,
          phone: client.phone,
          action: "error",
          reason: error instanceof Error ? error.message.slice(0, 240) : "update_failed",
          to: decision.evidence.campaignName,
          evidence: decision.evidence.source,
        });
        continue;
      }
    }

    results.push({
      id: client.id,
      name: client.name,
      phone: client.phone,
      action: args.apply ? "updated" : "would_update",
      from: client.campaignName || null,
      to: decision.evidence.campaignName,
      evidence: decision.evidence.source,
    });
  }

  const summary = {
    dryRun: !args.apply,
    unit: unit || "Todas",
    usingDirectUrl: args.useDirectUrl,
    scanned: genericCtwaClients.length,
    wouldUpdate: results.filter((item) => item.action === "would_update").length,
    updated: results.filter((item) => item.action === "updated").length,
    skipped: results.filter((item) => item.action === "skipped").length,
    errors: results.filter((item) => item.action === "error").length,
  };

  console.log(JSON.stringify({ summary, results }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
if (args.useDirectUrl) {
  if (!process.env.DIRECT_URL) {
    throw new Error("DIRECT_URL nao configurada");
  }
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

main(args)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
