import { prisma } from "@/lib/db";

export function normalizeCampaignText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wordsOf(value: string) {
  return normalizeCampaignText(value)
    .split(" ")
    .filter((word) => word.length >= 4 && !["clinica", "virtuosa", "santo", "santos", "saude", "estetica", "whatsapp", "facebook", "instagram"].includes(word));
}

export function inferCampaignByKeywords(signal: string): string | null {
  const normalized = normalizeCampaignText(signal);
  if (!normalized) return null;

  const rules: Array<{ name: string; patterns: RegExp[] }> = [
    {
      name: "MonjiFast",
      patterns: [
        /\bmonji\s*fast\b/,
        /\bmonjifast\b/,
        /\bmonji\b/,
      ],
    },
    {
      name: "Barriga Trincada",
      patterns: [
        /\bbarriga trincada\b/,
        /\bprojeto barriga\b/,
      ],
    },
    {
      name: "HyperSlim",
      patterns: [
        /\bhyper\s*slim\b/,
        /\bhyperslim\b/,
        /\btonificacao\b/,
        /\bdefinicao muscular\b/,
        /\bcontorno corporal\b/,
        /\babdomen\b/,
        /\bcintura\b/,
      ],
    },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) return rule.name;
  }

  return null;
}

export async function inferManagedCampaignName(signal: string, unit?: string | null): Promise<string | null> {
  const normalizedSignal = normalizeCampaignText(signal);
  if (!normalizedSignal) return null;

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "ativa",
      ...(unit ? { OR: [{ unit }, { unit: "Todas" }] } : {}),
    },
    select: { name: true },
  });

  let best: { name: string; score: number } | null = null;
  for (const campaign of campaigns) {
    const terms = wordsOf(campaign.name);
    if (terms.length === 0) continue;

    const hits = terms.filter((term) => normalizedSignal.includes(term)).length;
    const score = hits / terms.length;
    if (hits > 0 && (!best || score > best.score)) {
      best = { name: campaign.name, score };
    }
  }

  return best && best.score >= 0.5 ? best.name : null;
}

export async function inferCampaignNameFromSignal(signal: string, unit?: string | null) {
  const managedCampaignName = await inferManagedCampaignName(signal, unit);
  const keywordCampaignName = inferCampaignByKeywords(signal);
  return {
    campaignName: keywordCampaignName || managedCampaignName,
    managedCampaignName,
    keywordCampaignName,
  };
}
