import { normalizeAiPublicSdrState } from "@/lib/ai-public-sdr";
import { createPrivateBlobReadUrl } from "@/lib/whatsapp/media-storage";

type ProcedureMediaAsset = {
  id: string;
  unit: "Osasco";
  campaignName: "Preenchimento Facial";
  concernArea: "lips" | "under_eyes" | "nasolabial_fold";
  title: string;
  alt: string;
  caption: string;
  storageUrl: string;
};

const PROCEDURE_MEDIA_ASSETS: ProcedureMediaAsset[] = [
  {
    id: "preenchimento-osasco-bigode-chines-v1",
    unit: "Osasco",
    campaignName: "Preenchimento Facial",
    concernArea: "nasolabial_fold",
    title: "Exemplo de Bigode Chinês",
    alt: "Comparação autorizada de antes e depois do preenchimento na região do bigode chinês",
    caption: "Exemplo autorizado de resultado real. O resultado varia conforme a avaliação e as características de cada pessoa.",
    storageUrl: "https://26xqdz87ebp3lgu2.private.blob.vercel-storage.com/ai-training/preenchimento-facial/bigode-chines.jpg",
  },
  {
    id: "preenchimento-osasco-olheiras-v1",
    unit: "Osasco",
    campaignName: "Preenchimento Facial",
    concernArea: "under_eyes",
    title: "Exemplo de Olheiras",
    alt: "Comparação autorizada de antes e depois do preenchimento na região das olheiras",
    caption: "Exemplo autorizado de resultado real. O resultado varia conforme a avaliação e as características de cada pessoa.",
    storageUrl: "https://26xqdz87ebp3lgu2.private.blob.vercel-storage.com/ai-training/preenchimento-facial/olheiras.png",
  },
  {
    id: "preenchimento-osasco-labial-v1",
    unit: "Osasco",
    campaignName: "Preenchimento Facial",
    concernArea: "lips",
    title: "Exemplo de Preenchimento Labial",
    alt: "Comparação autorizada de antes e depois do preenchimento labial",
    caption: "Exemplo autorizado de resultado real. O resultado varia conforme a avaliação e as características de cada pessoa.",
    storageUrl: "https://26xqdz87ebp3lgu2.private.blob.vercel-storage.com/ai-training/preenchimento-facial/preenchimento-labial.jpeg",
  },
];

function normalizedReference(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function selectAiPublicProcedureMedia(params: {
  unit: string;
  campaignName?: string | null;
  previousConversationState?: unknown;
  nextConversationState?: unknown;
}) {
  const previous = normalizeAiPublicSdrState(params.previousConversationState);
  const next = normalizeAiPublicSdrState(params.nextConversationState);
  const campaignName = normalizedReference(params.campaignName || next.campaignName);
  const wasAlreadyExplained = previous.topicsCovered.some((topic) => (
    topic === "campaign_overview" || topic === "procedure_function"
  ));
  const explanationWasAdded = next.topicsCovered.some((topic) => (
    topic === "campaign_overview" || topic === "procedure_function"
  ));
  const reachedCampaignExplanation = [
    "qualify_experience",
    "qualify_experience_satisfaction",
    "clarify_experience_origin",
    "explain_campaign",
  ].includes(previous.nextObjective)
    && next.qualification.previousExperience !== "unknown";

  if (params.unit !== "Osasco" || !campaignName.includes("preenchimento facial")) return null;
  if (next.qualification.previousExperience !== "first_time") return null;
  if (wasAlreadyExplained || (!explanationWasAdded && !reachedCampaignExplanation)) return null;

  return PROCEDURE_MEDIA_ASSETS.find((asset) => (
    asset.unit === params.unit
    && asset.concernArea === next.qualification.concernArea
  )) || null;
}

export async function publicProcedureMedia(assetId: string) {
  const asset = PROCEDURE_MEDIA_ASSETS.find((candidate) => candidate.id === assetId);
  if (!asset) return null;

  return {
    id: asset.id,
    type: "image" as const,
    title: asset.title,
    alt: asset.alt,
    caption: asset.caption,
    url: await createPrivateBlobReadUrl(asset.storageUrl, 15 * 60 * 1000),
  };
}
