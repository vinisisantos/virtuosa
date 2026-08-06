import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAiPublicSdrState,
  aiPublicCampaignDiscoveryGuide,
  aiPublicSdrStateWithAssistantCommitment,
  classifyAiPublicSdrIntent,
  classifyAiPublicSdrIntents,
  emptyAiPublicSdrState,
} from "../src/lib/ai-public-sdr.ts";
import {
  aiPublicSchedulingDateRequestFromMessage,
  aiPublicSchedulingWeekdayFromMessage,
  emptyAiPublicSchedulingState,
  ordinalOptionIndex,
  resolveAiPublicSchedulingTurn,
} from "../src/lib/ai-public-scheduling.ts";
import {
  buildAiPublicResponsePolicy,
  detectAiPublicExplanationPermission,
  detectAiPublicHumanHandoffOffer,
  validateAiPublicResponseDraft,
} from "../src/lib/ai-public-response-policy.ts";

const NOW = new Date("2026-08-05T15:00:00-03:00");
const OFFERED_SLOTS = [
  { date: "2026-08-12", time: "10:00" },
  { date: "2026-08-12", time: "12:00" },
];

function confirmedState() {
  return {
    ...emptyAiPublicSchedulingState(),
    status: "confirmed",
    offeredSlots: OFFERED_SLOTS,
    confirmedDate: OFFERED_SLOTS[0].date,
    confirmedTime: OFFERED_SLOTS[0].time,
  };
}

test("períodos relativos começam na data mínima correta", () => {
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("só consigo na próxima semana", NOW),
    { kind: "resolved", date: "2026-08-10", mode: "not_before", resetsWeekday: true },
  );
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("só consigo mês que vem", NOW),
    { kind: "resolved", date: "2026-09-01", mode: "not_before", resetsWeekday: true },
  );
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("só consigo daqui 3 semanas", NOW),
    { kind: "resolved", date: "2026-08-26", mode: "not_before", resetsWeekday: true },
  );
});

test("dia sem mês exige confirmação antes da consulta", () => {
  assert.deepEqual(
    aiPublicSchedulingDateRequestFromMessage("pode ser dia 10", NOW),
    { kind: "clarify", proposedDate: "2026-08-10", mode: "exact", resetsWeekday: true },
  );
});

test("segunda-feira não colide com segunda opção", () => {
  assert.equal(aiPublicSchedulingWeekdayFromMessage("só posso na segunda-feira"), 1);
  assert.equal(aiPublicSchedulingWeekdayFromMessage("segunda-feira da próxima semana, quais horários?"), 1);
  assert.equal(aiPublicSchedulingWeekdayFromMessage("a segunda opção"), null);
  assert.equal(ordinalOptionIndex("a primeira opção"), 0);
  assert.equal(ordinalOptionIndex("o primeiro horário"), 0);
  assert.equal(ordinalOptionIndex("a segunda opção"), 1);
  assert.equal(ordinalOptionIndex("o terceiro horário"), 2);
});

test("pergunta por outro dia não confirma horário oferecido", () => {
  const turn = resolveAiPublicSchedulingTurn({
    previous: {
      ...emptyAiPublicSchedulingState(),
      status: "awaiting_confirmation",
      preference: "weekday",
      offeredSlots: OFFERED_SLOTS,
    },
    latestClientMessage: "segunda-feira da próxima semana você tem quais horários?",
    now: NOW,
  });
  assert.equal(turn.state.status, "collecting_period");
  assert.equal(turn.state.requestedWeekday, 1);
  assert.equal(turn.state.confirmedDate, null);
});

test("escolhas inequívocas continuam confirmando primeira e segunda opção", () => {
  const previous = {
    ...emptyAiPublicSchedulingState(),
    status: "awaiting_confirmation",
    preference: "weekday",
    offeredSlots: OFFERED_SLOTS,
  };
  const first = resolveAiPublicSchedulingTurn({ previous, latestClientMessage: "pode ser o das 10h", now: NOW });
  const second = resolveAiPublicSchedulingTurn({ previous, latestClientMessage: "confirmo a segunda opção", now: NOW });
  assert.equal(first.state.status, "confirmed");
  assert.equal(first.state.confirmedTime, "10:00");
  assert.equal(second.state.status, "confirmed");
  assert.equal(second.state.confirmedTime, "12:00");
});

test("cancelamento e remarcação após confirmação têm estados explícitos", () => {
  const cancelled = resolveAiPublicSchedulingTurn({
    previous: confirmedState(),
    latestClientMessage: "preciso cancelar",
    now: NOW,
  });
  assert.equal(cancelled.state.status, "declined");
  assert.equal(cancelled.state.reason, "cancelled_by_client");
  const afterCancellation = resolveAiPublicSchedulingTurn({
    previous: cancelled.state,
    latestClientMessage: "quanto custa o procedimento?",
    now: NOW,
  });
  assert.equal(afterCancellation.active, false);
  assert.equal(afterCancellation.state.status, "declined");

  const rescheduled = resolveAiPublicSchedulingTurn({
    previous: confirmedState(),
    latestClientMessage: "quero remarcar para segunda-feira",
    now: NOW,
  });
  assert.equal(rescheduled.state.status, "declined");
  assert.equal(rescheduled.state.reason, "reschedule_requested");
  assert.equal(rescheduled.state.requestedWeekday, 1);

  const unrelated = resolveAiPublicSchedulingTurn({
    previous: confirmedState(),
    latestClientMessage: "quanto custa o procedimento?",
    now: NOW,
  });
  assert.equal(unrelated.state.status, "confirmed");
});

test("classificador preserva prioridade e registra múltiplas intenções", () => {
  assert.equal(classifyAiPublicSdrIntent("Quero entender como funciona"), "learn");
  assert.deepEqual(classifyAiPublicSdrIntents("Quanto custa e como funciona?"), ["price", "learn"]);

  const previous = {
    ...emptyAiPublicSdrState(),
    turnCount: 2,
    nextObjective: "await_choice",
  };
  assert.equal(classifyAiPublicSdrIntent("sim", previous), "positive_confirmation");
  assert.equal(
    classifyAiPublicSdrIntent("segunda-feira da próxima semana você tem quais horários?", previous),
    "availability",
  );
});

test("aceite curto cumpre explicação prometida antes de avançar", () => {
  const previous = aiPublicSdrStateWithAssistantCommitment({
    ...emptyAiPublicSdrState(),
    phase: "education",
    turnCount: 7,
    campaignName: "Gordura Localizada",
    nextObjective: "deepen_interest",
    topicsCovered: ["campaign_overview", "procedure_function"],
    qualification: {
      ...emptyAiPublicSdrState().qualification,
      concernArea: "flanks",
      previousExperience: "first_time",
      previousExperienceKnown: true,
    },
  }, "Você quer que eu te explique como funciona cada etapa do protocolo?");

  assert.equal(previous.pendingCommitment, "explain_campaign_items");
  assert.equal(classifyAiPublicSdrIntent("quero", previous), "learn");

  const planned = advanceAiPublicSdrState({
    previous,
    latestClientMessage: "quero",
    assistantMessages: [],
    approvedCampaignName: "Gordura Localizada",
  });
  assert.equal(planned.phase, "education");
  assert.equal(planned.nextObjective, "explain_campaign_items");
  assert.equal(planned.pendingCommitment, "none");
});

test("guardrail exige entrega da explicação e bloqueia nova etapa de permissão", () => {
  const policy = buildAiPublicResponsePolicy({
    latestClientMessage: "quero",
    campaignNames: ["Gordura Localizada"],
    campaignItems: [
      { name: "Enzimas", quantity: 5, quantityText: "5 sessões de Enzimas" },
      { name: "Placas", quantity: 4, quantityText: "4 Placas" },
      { name: "Pós-Crio", quantity: 1, quantityText: "1 Pós-Crio" },
    ],
    technicalItems: [],
    campaignItemExplanations: [
      { name: "Enzimas", status: "restricted" },
      { name: "Placas", status: "approved" },
      { name: "Pós-Crio", status: "missing" },
    ],
    fulfillExplanationCommitment: true,
    priceDiscussionAllowed: false,
    requireQuestionAtEnd: false,
  });

  assert.equal(policy.detailedBreakdownRequested, true);
  assert.equal(policy.requiredCampaignItems.length, 3);
  for (const message of [
    "Quer que eu explique cada etapa do protocolo?",
    "Quer saber como funciona cada etapa?",
    "Se quiser, explico os itens do protocolo.",
  ]) {
    assert.equal(detectAiPublicExplanationPermission(message), true, message);
  }
  assert.ok(validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Quer que eu explique cada etapa do protocolo?"],
  }, policy).some((error) => error.includes("pediu permissão para explicar")));
  assert.ok(validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Na avaliação presencial, nossa especialista define a melhor estratégia com você."],
  }, policy).some((error) => error.includes("omitiu item comercial")));
  assert.deepEqual(validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["As Placas usam resfriamento controlado da gordura localizada. A composição das Enzimas e a função exata do Pós-Crio precisam ser definidas na avaliação, sem presumir etapas do protocolo."],
  }, policy), []);
});

test("estado estruturado acompanha todas as intenções e tópicos respondidos", () => {
  const state = advanceAiPublicSdrState({
    previous: emptyAiPublicSdrState(),
    latestClientMessage: "Quanto custa e como funciona?",
    assistantMessages: ["O protocolo funciona assim e o investimento é informado pela campanha."],
  });
  assert.equal(state.latestIntent, "price");
  assert.deepEqual(state.latestIntents, ["price", "learn"]);
  assert.ok(state.topicsCovered.includes("price"));
  assert.ok(state.topicsCovered.includes("procedure_function"));
});

test("negação da Virtuosa preserva origem em outra clínica", () => {
  const state = advanceAiPublicSdrState({
    previous: {
      ...emptyAiPublicSdrState(),
      turnCount: 2,
      nextObjective: "qualify_experience",
    },
    latestClientMessage: "Não foi na Virtuosa, foi em outra clínica",
    assistantMessages: ["Como foi sua experiência?"],
  });
  assert.equal(state.qualification.previousExperience, "other_clinic");
});

test("guia de preenchimento facial usa apenas as regiões da campanha", () => {
  const guide = aiPublicCampaignDiscoveryGuide("Preenchimento Facial");
  assert.equal(guide.conversionProfile, "facial_injectable");
  assert.deepEqual(guide.concernExamples, ["lábios", "bigode chinês", "olheiras"]);
  assert.match(guide.concernQuestion, /lábios, bigode chinês ou olheiras/i);
});

test("primeira experiência facial mostra prova, confirma unidade e avança para avaliação", () => {
  const qualifying = {
    ...emptyAiPublicSdrState(),
    phase: "qualification",
    campaignName: "Preenchimento Facial",
    nextObjective: "qualify_experience",
    turnCount: 3,
    qualification: {
      ...emptyAiPublicSdrState().qualification,
      concernArea: "under_eyes",
    },
  };
  const explained = advanceAiPublicSdrState({
    previous: qualifying,
    latestClientMessage: "sim, primeira vez",
    assistantMessages: [
      "O preenchimento de olheiras pode suavizar o sulco em pessoas selecionadas. Nossa unidade de Osasco fica na Rua de teste, 100. Você consegue comparecer em Osasco?",
    ],
    approvedCampaignName: "Preenchimento Facial",
  });

  assert.equal(explained.qualification.previousExperience, "first_time");
  assert.equal(explained.qualification.unitKnown, false);
  assert.equal(explained.nextObjective, "confirm_unit");
  assert.ok(explained.topicsCovered.includes("procedure_function"));
  const unitConfirmed = advanceAiPublicSdrState({
    previous: explained,
    latestClientMessage: "sou sim",
    assistantMessages: [],
    approvedCampaignName: "Preenchimento Facial",
  });
  assert.equal(unitConfirmed.qualification.unitKnown, true);
  assert.equal(unitConfirmed.nextObjective, "offer_next_step");
});

test("experiência facial anterior preserva satisfação antes da reavaliação", () => {
  const qualifying = {
    ...emptyAiPublicSdrState(),
    phase: "qualification",
    campaignName: "Preenchimento Facial",
    nextObjective: "qualify_experience",
    turnCount: 3,
    qualification: {
      ...emptyAiPublicSdrState().qualification,
      concernArea: "lips",
    },
  };
  const experienced = advanceAiPublicSdrState({
    previous: qualifying,
    latestClientMessage: "já fiz antes",
    assistantMessages: ["Como foi sua experiência e o resultado?"],
    approvedCampaignName: "Preenchimento Facial",
  });
  assert.equal(experienced.nextObjective, "qualify_experience_satisfaction");

  const satisfied = advanceAiPublicSdrState({
    previous: experienced,
    latestClientMessage: "gostei bastante",
    assistantMessages: ["O preenchimento labial pode ajustar volume e contorno de forma personalizada."],
    approvedCampaignName: "Preenchimento Facial",
  });
  assert.equal(satisfied.qualification.previousExperienceSatisfaction, "positive");
  assert.equal(satisfied.nextObjective, "confirm_unit");
});

test("guardrail facial exige unidade e endereço aprovados", () => {
  const policy = buildAiPublicResponsePolicy({
    latestClientMessage: "sim, primeira vez",
    campaignNames: ["Preenchimento Facial"],
    campaignItems: [],
    technicalItems: [],
    priceDiscussionAllowed: false,
    requireUnitConfirmation: true,
    requiredUnitName: "Osasco",
    requiredUnitAddress: "Rua de teste, 100",
  });
  assert.ok(validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Essa é uma região bastante procurada. Você consegue comparecer em Osasco?"],
  }, policy).some((error) => error.includes("endereço aprovado")));
  assert.deepEqual(validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["O preenchimento é definido após avaliação. Nossa unidade fica na Rua de teste, 100, em Osasco. Você consegue comparecer?"],
  }, policy), []);
});

test("guardrail reconhece variações de oferta de atendimento humano", () => {
  for (const message of [
    "Quer que eu chame alguém da equipe?",
    "Posso te colocar em contato com uma consultora?",
    "Você prefere falar com nossa especialista?",
    "Se desejar, posso te encaminhar para ela.",
  ]) {
    assert.equal(detectAiPublicHumanHandoffOffer(message), true, message);
  }
  for (const message of [
    "Nossa equipe cuidará para que sua experiência seja positiva.",
    "A especialista define a estratégia junto com você.",
    "Posso falar sobre nossa equipe e a avaliação.",
  ]) {
    assert.equal(detectAiPublicHumanHandoffOffer(message), false, message);
  }
});
