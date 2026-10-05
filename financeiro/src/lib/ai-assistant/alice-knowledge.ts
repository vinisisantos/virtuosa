import "server-only";
import { ALICE_KNOWLEDGE } from "@/generated/alice-knowledge";
import type { AliceUnit } from "@/lib/ai-assistant/policy";
import { selectAliceKnowledgeDocuments } from "@/lib/ai-assistant/alice-knowledge-selection";

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
}) {
  if (!ALICE_KNOWLEDGE.available || !ALICE_KNOWLEDGE.activeUnits.includes(params.unit)) return null;

  const selected = selectAliceKnowledgeDocuments({
    documents: ALICE_KNOWLEDGE.documents,
    campaignName: params.campaignName,
    messageText: params.messageText,
  });
  if (!selected) return null;

  return {
    revision: ALICE_KNOWLEDGE.revision,
    unit: params.unit,
    excludedTopics: ALICE_KNOWLEDGE.excludedTopics,
    documents: selected,
  };
}
