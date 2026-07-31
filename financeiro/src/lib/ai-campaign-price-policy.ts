export type CampaignPriceSource = "caption" | "image" | "absent";
export const AI_CAMPAIGN_PRICE_POLICY_VERSION = "campaign-price-v2";

export type CampaignPriceResolution = {
  source: CampaignPriceSource;
  sourceText: string | null;
  displayText: string | null;
};

export type CampaignPriceAudit = {
  policyVersion: typeof AI_CAMPAIGN_PRICE_POLICY_VERSION;
  source: CampaignPriceSource;
  resolvedSource: CampaignPriceSource;
  sourceText: string | null;
  displayText: string | null;
  unit: string;
  campaignName: string | null;
  requested: boolean;
  used: boolean;
};

const BRL_AMOUNT = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const INSTALLMENT_PRICE = new RegExp(
  String.raw`\b(\d{1,2})\s*x\s*(?:de\s*)?(R\$\s*${BRL_AMOUNT})`,
  "i",
);
const SINGLE_PRICE = new RegExp(String.raw`R\$\s*${BRL_AMOUNT}`, "i");
const PRICE_INTENT = /\b(?:pre[cç]o|valor|custo|quanto\s+(?:custa|fica|sai)|custa\s+quanto|or[cç]amento|investimento)\b/i;
const EXACT_PRICE_INTENT = /\b(?:valor|pre[cç]o)\s+(?:exato|fechado|final)|\bme\s+(?:d[aá]|passa|informa)\s+(?:o\s+)?(?:valor|pre[cç]o)\b/i;

function normalizeBrl(value: string) {
  return value.replace(/R\$\s*/i, "R$ ").replace(/\s+/g, " ").trim();
}

export function extractCampaignPrice(value?: string | null) {
  if (!value?.trim()) return null;

  const installment = value.match(INSTALLMENT_PRICE);
  if (installment) {
    const sourceText = normalizeBrl(installment[0]);
    const amount = normalizeBrl(installment[2]);
    return {
      sourceText,
      displayText: `a partir de ${installment[1]}x de ${amount}`,
    };
  }

  const single = value.match(SINGLE_PRICE);
  if (!single) return null;
  const sourceText = normalizeBrl(single[0]);
  return {
    sourceText,
    displayText: `a partir de ${sourceText}`,
  };
}

export function resolveCampaignPrice(params: {
  caption?: string | null;
  imagePriceText?: string | null;
}): CampaignPriceResolution {
  const captionPrice = extractCampaignPrice(params.caption);
  if (captionPrice) return { source: "caption", ...captionPrice };

  const imagePrice = extractCampaignPrice(params.imagePriceText);
  if (imagePrice) return { source: "image", ...imagePrice };

  return { source: "absent", sourceText: null, displayText: null };
}

export function hasCampaignPriceIntent(value?: string | null) {
  return Boolean(value && (PRICE_INTENT.test(value) || EXACT_PRICE_INTENT.test(value)));
}

export function containsCampaignPrice(value: string) {
  return SINGLE_PRICE.test(value);
}

export function buildCampaignPriceMessages(params: {
  campaignName?: string | null;
  price: CampaignPriceResolution;
  additionalParagraphs?: string[];
}) {
  const nextStep = "Você prefere falar com nossa especialista para continuar ou agendar uma avaliação presencial?";
  const additionalParagraphs = (params.additionalParagraphs || [])
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (params.price.source === "absent" || !params.price.displayText) {
    return [
      [
        "O valor é definido após a avaliação, pois depende do protocolo, da área tratada e, quando aplicável, da quantidade de produto ou de sessões.",
        ...additionalParagraphs,
        nextStep,
      ].join("\n\n"),
    ];
  }

  const campaignReference = params.campaignName ? ` para a campanha ${params.campaignName}` : "";
  return [
    [
      `O valor divulgado${campaignReference} é ${params.price.displayText}. Pode variar conforme a região ou unidade e a quantidade de produto ou o protocolo indicado.`,
      ...additionalParagraphs,
      nextStep,
    ].join("\n\n"),
  ];
}
