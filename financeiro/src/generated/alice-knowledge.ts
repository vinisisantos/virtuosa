export const ALICE_KNOWLEDGE = {
  available: false,
  repository: "vinisisantos/virtuosa-agent",
  revision: "be272f87ceff872dc684c26941aed75c72928927",
  activeUnits: ["SBC", "Osasco"],
  excludedTopics: ["Harmonização de Mamas", "Preenchimento Facial"],
  behavior: {
    suggestionsRequireHumanReview: true,
    sendMessagesAutomatically: false,
    scheduleAutomatically: false,
    inferUnverifiedClinicalFacts: false,
  },
  documents: [] as { path: string; content: string }[],
} as const;
