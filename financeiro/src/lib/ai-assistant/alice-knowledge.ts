import "server-only";
import { ALICE_KNOWLEDGE } from "@/generated/alice-knowledge";
import type { AliceUnit } from "@/lib/ai-assistant/policy";

const CORE_DOCUMENTS = ["AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md"];
const MAX_SELECTED_DOCUMENTS = CORE_DOCUMENTS.length + 4;
const MAX_SELECTED_KNOWLEDGE_CHARS = 24_000;

function tokens(value: string) {
  return new Set(value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((word) => word.length >= 4));
}

function relevance(content: string, terms: Set<string>) {
  let score = 0;
  for (const token of tokens(content)) if (terms.has(token)) score += 1;
  return score;
}

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

  const messageTerms = tokens(`${params.campaignName} ${params.messageText}`);
  const documents = ALICE_KNOWLEDGE.documents
    .map((document) => ({
      ...document,
      priority: CORE_DOCUMENTS.includes(document.path) ? 10_000 : relevance(`${document.path} ${document.content}`, messageTerms),
    }))
    .filter((document) => document.priority > 0)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, MAX_SELECTED_DOCUMENTS);

  let remainingChars = MAX_SELECTED_KNOWLEDGE_CHARS;
  const selected = documents.flatMap((document) => {
    if (remainingChars <= 0) return [];
    const content = document.content.slice(0, remainingChars);
    remainingChars -= content.length;
    return [{ source: document.path, content }];
  });
  if (!selected.some((document) => CORE_DOCUMENTS.includes(document.source))) return null;

  return {
    revision: ALICE_KNOWLEDGE.revision,
    unit: params.unit,
    excludedTopics: ALICE_KNOWLEDGE.excludedTopics,
    documents: selected,
  };
}
