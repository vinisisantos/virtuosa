import { prisma } from "@/lib/db";
import { normalizeCampaignText } from "@/lib/campaign-labels";
import { FACIAL_FILLER_CAMPAIGN_NAME } from "@/lib/campaign-track-mapping";

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
      name: FACIAL_FILLER_CAMPAIGN_NAME,
      patterns: [
        /\bpreenchimento facial\b/,
        /\bpreenchimento do rosto\b/,
      ],
    },
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
        /\bbarriga sem cirurgia\b/,
        /\btrincar (?:a )?barriga\b/,
        /\bsecar (?:a )?barriga\b/,
        /\bbarriga definida\b/,
        /\bdefinir (?:a )?barriga\b/,
        /\bbarriga\b.{0,40}\bsem cirurgia\b/,
        /\bbarriga\b.{0,40}\bprocedimento\b/,
        /\bbarriga\b.{0,40}\bsessoes\b/,
        /\bbraco(?:s)?\b.{0,40}\bbarriga\b/,
        /\bbarriga\b.{0,40}\bbraco(?:s)?\b/,
        /\bminha barriga\b/,
        /\babdome(?:n)? definido\b/,
        /\bcriolipolise\b/,
        /\bplacas de criolipolise\b/,
        /\bcorrente russa\b/,
        /\blipo sem corte\b/,
        /\bquebra e metaboliza gordura\b/,
      ],
    },
    {
      name: "Emagrecimento e Definição",
      patterns: [
        /\b28kg em 3 meses\b/,
        /\bemagrecimento\b/,
        /\bperda de peso\b/,
        /\bresultado real\b/,
      ],
    },
    {
      name: "HyperSlim",
      patterns: [
        /\bhyper\s*slim\b/,
        /\bhyperslim\b/,
        /\btecnologia hyper\s*slim\b/,
        /\bprotocolo (?:com )?tecnologia hyper\s*slim\b/,
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
