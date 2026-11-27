import "server-only";
import { ALICE_KNOWLEDGE } from "@/generated/alice-knowledge";
import type { AliceUnit } from "@/lib/ai-assistant/policy";
import { selectAliceKnowledgeDocuments } from "@/lib/ai-assistant/alice-knowledge-selection";
import { pinkFridaySbcOffer, pinkFridaySbcActive } from "@/lib/pink-friday-sbc";

export function getAliceKnowledgeStatus() {
  const behavior = ALICE_KNOWLEDGE.behavior;
  return {
    available: ALICE_KNOWLEDGE.available,
    repository: ALICE_KNOWLEDGE.repository,
    revision: ALICE_KNOWLEDGE.revision,
    activeUnits: ALICE_KNOWLEDGE.activeUnits,
    activeDocuments: ALICE_KNOWLEDGE.documents.length,
    excludedTopics: ALICE_KNOWLEDGE.excludedTopics,
    humanReviewRequired: behavior.suggestionsRequireHumanReview,
    automaticSending: behavior.sendMessagesAutomatically,
  };
}

export function buildAliceKnowledgeContext(params: {
  unit: AliceUnit;
  campaignName: string;
  messageText: string;
  now?: Date;
}) {
  if (!ALICE_KNOWLEDGE.available || !ALICE_KNOWLEDGE.activeUnits.includes(params.unit)) return null;

  const selected = selectAliceKnowledgeDocuments({
    documents: ALICE_KNOWLEDGE.documents,
    unit: params.unit,
    campaignName: params.campaignName,
    messageText: params.messageText,
  });
  if (!selected) return null;
  const promotion = pinkFridaySbcOffer(params.unit, params.campaignName);

  return {
    revision: ALICE_KNOWLEDGE.revision,
    unit: params.unit,
    excludedTopics: ALICE_KNOWLEDGE.excludedTopics,
    documents: selected,
    ...(promotion ? { ofertaExclusiva: { campanha: promotion.name, validade: "29/11/2026", unidade: "SBC",
      vigente: pinkFridaySbcActive(params.now), regra: "Use somente os preços e condições desta oferta. Após o prazo, não confirme preço promocional vigente nem prorrogação." } } : {}),
  };
}
