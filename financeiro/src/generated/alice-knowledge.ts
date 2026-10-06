export const ALICE_KNOWLEDGE = {
  available: false,
  repository: "vinisisantos/virtuosa-agent",
  revision: "4771d4f46702872a50c41b9bdc1cb1bc5e8f6612",
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
