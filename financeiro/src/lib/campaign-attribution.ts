import { prisma } from "@/lib/db";
import { normalizeCampaignText } from "@/lib/campaign-labels";
import { FACIAL_FILLER_CAMPAIGN_NAME, GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME, HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME } from "@/lib/campaign-track-mapping";

function wordsOf(value: string) {
  return normalizeCampaignText(value)
    .split(" ")
    .filter((word) => word.length >= 4 && !["clinica", "virtuosa", "santo", "santos", "saude", "estetica", "whatsapp", "facebook", "instagram"].includes(word));
}

export function inferCampaignByKeywords(signal: string): string | null {
  const normalized = normalizeCampaignText(signal);
  if (!normalized) return null;

  const rules: Array<{ name: string; patterns: RegExp[] }> = [
    { name: GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME, patterns: [/\bgluteos? perfeitos? 120 ?ml\b/] },
    { name: "Glúteo Perfeito", patterns: [/\bgluteos? perfeitos?\b(?!\s*\d)/, /\bgluteos? perfeitos? 60 ?ml\b/] },
    { name: "Harmonização de Glúteos", patterns: [/\bharmonizacao (?:de )?gluteos?\b/] },
    { name: HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME, patterns: [/\bharmonizacao (?:de )?mamas?\b/] },
    { name: "Combo Harmonização", patterns: [/\bcombo harmonizacao\b/] },
    { name: "Adeus Rosto Cansado", patterns: [/\badeus rosto cansado\b/] },
    { name: "Gordura Localizada", patterns: [/\bgordura localizada\b/] },
    {
      name: FACIAL_FILLER_CAMPAIGN_NAME,
      patterns: [
        /\bpreenchimento facial\b/,
        /\bpreenchimento do rosto\b/,
        /\bpreenchimento labial\b/,
        /\bharmonizacao facial\b/,
      ],
    },
    {
      name: "Botox",
      patterns: [
        /\bbotox\b/,
        /\btoxina botulinica\b/,
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

  const matches = rules.filter(rule => rule.patterns.some(pattern => pattern.test(normalized)));
  return matches.length === 1 ? matches[0].name : null;
}

export function matchManagedCampaignName(signal: string, campaigns: Array<{ name: string }>) {
  const signalWords = new Set(normalizeCampaignText(signal).split(" "));
  const matches = campaigns.filter(campaign => {
    const terms = wordsOf(campaign.name);
    return terms.length > 0 && terms.every(term => signalWords.has(term));
  });
  // "Harmonização" sozinha não diferencia mamas, glúteos ou combo.
  const names = [...new Map(matches.map(c => [wordsOf(c.name).join(" "), c.name])).values()];
  return names.length === 1 ? names[0] : null;
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

  return matchManagedCampaignName(normalizedSignal, campaigns);
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
