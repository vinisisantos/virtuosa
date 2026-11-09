// Documento sintético no lugar do arquivo privado gerado no build, sem fatos de clientes.
export const ALICE_KNOWLEDGE = {
  available: true, repository: "fixture", revision: "isolated-test", activeUnits: ["SBC"], excludedTopics: [],
  behavior: { suggestionsRequireHumanReview: true, sendMessagesAutomatically: false },
  documents: ["AGENTS.md", "IDENTITY.md", "RULES.md", "SAFETY.md", "SALES.md", "MEMORY.md", "knowledge/manual-atendimento-sbc.md",
    "knowledge/clinic.md", "knowledge/prices.md"].map((path) => ({ path, content: "Base sintética: acolher e convidar para avaliação. Não decidir indicação clínica." })),
};
