import type {
  AiTrainingDiagramV6Family,
  AiTrainingDiagramV6MediaKey,
} from "@/lib/ai-training-diagram-v6";

export const AI_TRAINING_DIAGRAM_V6_MEDIA: Record<AiTrainingDiagramV6MediaKey, string> = {
  campaign: "/ai-training/diagram-v6/campaign-general.webp",
  "body-proof": "/ai-training/diagram-v6/before-after/body-abdomen.webp",
  "facial-proof": "/ai-training/diagram-v6/before-after/facial-forehead.webp",
  "facial-lips": "/ai-training/diagram-v6/before-after/facial-lips.webp",
  "facial-under-eyes": "/ai-training/diagram-v6/before-after/facial-under-eyes.webp",
  "facial-nasolabial": "/ai-training/diagram-v6/before-after/facial-nasolabial.webp",
  "body-abdomen-before-after": "/ai-training/diagram-v6/before-after/body-abdomen.webp",
  "body-flanks-before-after": "/ai-training/diagram-v6/before-after/body-flanks.webp",
  "body-back-before-after": "/ai-training/diagram-v6/before-after/body-back.webp",
  "body-arms-before-after": "/ai-training/diagram-v6/before-after/body-arms.webp",
  "body-outer-thighs-before-after": "/ai-training/diagram-v6/before-after/body-outer-thighs.webp",
  "body-glutes-before-after": "/ai-training/diagram-v6/before-after/body-glutes.webp",
  "facial-lips-before-after": "/ai-training/diagram-v6/before-after/facial-lips.webp",
  "facial-under-eyes-before-after": "/ai-training/diagram-v6/before-after/facial-under-eyes.webp",
  "facial-nasolabial-before-after": "/ai-training/diagram-v6/before-after/facial-nasolabial.webp",
  "facial-forehead-before-after": "/ai-training/diagram-v6/before-after/facial-forehead.webp",
  "facial-glabella-before-after": "/ai-training/diagram-v6/before-after/facial-glabella.webp",
  "facial-crow-feet-before-after": "/ai-training/diagram-v6/before-after/facial-crow-feet.webp",
};

const CAMPAIGN_MEDIA: Record<string, string> = {
  "barriga trincada": "/ai-training/diagram-v6/campaigns/barriga-trincada.webp",
  botox: "/ai-training/diagram-v6/campaigns/botox.webp",
  "gluteo perfeito": "/ai-training/diagram-v6/campaigns/gluteo-perfeito.webp",
  "gordura localizada": "/ai-training/diagram-v6/campaigns/gordura-localizada.webp",
  "harmonizacao de gluteos": "/ai-training/diagram-v6/campaigns/harmonizacao-gluteos.webp",
  hyperslim: "/ai-training/diagram-v6/campaigns/hyperslim.webp",
  "preenchimento facial": "/ai-training/diagram-v6/campaigns/preenchimento-facial.webp",
  "emagrecimento e definicao": "/ai-training/diagram-v6/campaigns/emagrecimento-definicao.webp",
  monjifast: "/ai-training/diagram-v6/campaigns/monjifast.webp",
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function genericCampaignMedia(family?: AiTrainingDiagramV6Family) {
  if (family === "body") return "/ai-training/diagram-v6/campaign-body.webp";
  if (family === "facial") return "/ai-training/diagram-v6/campaign-facial.webp";
  return AI_TRAINING_DIAGRAM_V6_MEDIA.campaign;
}

export function aiTrainingDiagramV6Media(params: {
  mediaKey: AiTrainingDiagramV6MediaKey;
  campaignName?: string | null;
  family?: AiTrainingDiagramV6Family;
}) {
  if (params.mediaKey === "campaign") {
    const campaignName = params.campaignName?.trim() || "campanha selecionada";
    return {
      id: `diagram-v6-campaign-${normalized(campaignName).replace(/\s+/g, "-")}`,
      type: "image" as const,
      url: CAMPAIGN_MEDIA[normalized(campaignName)] || genericCampaignMedia(params.family),
      title: `Criativo fictício · ${campaignName}`,
      alt: `Criativo fictício gerado por IA para a campanha ${campaignName}`,
      caption: "CRIATIVO FICTÍCIO GERADO POR IA · SOMENTE TESTE",
      kind: "campaign" as const,
    };
  }

  return {
    id: `diagram-v6-${params.mediaKey}`,
    type: "image" as const,
    url: AI_TRAINING_DIAGRAM_V6_MEDIA[params.mediaKey],
    title: "Antes e depois fictício",
    alt: "Antes e depois fictício gerado por IA para esta simulação",
    caption: "IMAGEM FICTÍCIA GERADA POR IA · NÃO REPRESENTA PROMESSA DE RESULTADO",
    kind: "before-after" as const,
  };
}
