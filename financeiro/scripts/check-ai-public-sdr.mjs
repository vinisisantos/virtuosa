import assert from "node:assert/strict";
import {
  advanceAiPublicSdrState,
  aiPublicCampaignDiscoveryGuide,
  classifyAiPublicSdrIntent,
  emptyAiPublicSdrState,
  normalizeAiPublicSdrState,
} from "../src/lib/ai-public-sdr.ts";
import {
  aiPublicSchedulingPreferenceFromMessage,
  buildAiPublicSchedulingMessages,
  emptyAiPublicSchedulingState,
  resolveAiPublicSchedulingTurn,
} from "../src/lib/ai-public-scheduling.ts";
import {
  buildAiPublicResponsePolicy,
  validateAiPublicResponseDraft,
} from "../src/lib/ai-public-response-policy.ts";

function advance(previous, latestClientMessage, assistantMessages = ["Resposta de teste"]) {
  return advanceAiPublicSdrState({ previous, latestClientMessage, assistantMessages });
}

assert.equal(
  classifyAiPublicSdrIntent("Quero entender como funciona"),
  "learn",
  "como funciona deve ser aprendizado, não promessa de resultado",
);

const v1State = normalizeAiPublicSdrState({
  version: "public-sdr-v1",
  phase: "education",
  campaignName: "Barriga Trincada",
  latestIntent: "learn",
  activeObjection: "none",
  qualification: {
    concernArea: "abdomen",
    previousExperience: "first_time",
    previousExperienceKnown: true,
  },
  topicsCovered: ["campaign_overview", "procedure_function"],
  nextObjective: "deepen_interest",
  turnCount: 2,
});
assert.equal(v1State.version, "public-sdr-v4");
assert.equal(v1State.campaignName, "Barriga Trincada");
assert.deepEqual(v1State.topicsCovered, ["campaign_overview", "procedure_function"]);
assert.deepEqual(v1State.scheduling, emptyAiPublicSchedulingState());

const confirmedInterest = advance(v1State, "os dois");
assert.equal(confirmedInterest.latestIntent, "positive_confirmation");
assert.equal(confirmedInterest.phase, "conversion");
assert.equal(confirmedInterest.nextObjective, "offer_next_step");
assert.equal(confirmedInterest.readiness, "interested");
assert.equal(confirmedInterest.leadTemperature, "warm");

const priceObjection = advance(
  { ...emptyAiPublicSdrState(), phase: "education", turnCount: 2 },
  "Achei muito caro para mim",
);
assert.equal(priceObjection.activeObjection, "price");
assert.equal(priceObjection.objectionStatus, "identified");
assert.equal(priceObjection.phase, "objection");
assert.equal(priceObjection.nextObjective, "handle_objection");

const objectionResolved = advance(priceObjection, "pode ser");
assert.equal(objectionResolved.latestIntent, "positive_confirmation");
assert.equal(objectionResolved.activeObjection, "none");
assert.equal(objectionResolved.objectionStatus, "resolved");
assert.equal(objectionResolved.phase, "conversion");

const proposedRegression = advanceAiPublicSdrState({
  previous: confirmedInterest,
  proposed: { ...confirmedInterest, phase: "education", nextObjective: "deepen_interest" },
  latestClientMessage: "sim",
  assistantMessages: ["Vamos avançar para a avaliação."],
});
assert.equal(proposedRegression.phase, "conversion");
assert.equal(proposedRegression.nextObjective, "offer_next_step");

const scheduling = advance(confirmedInterest, "Quero agendar uma avaliação");
assert.equal(scheduling.latestIntent, "schedule");
assert.equal(scheduling.phase, "conversion");
assert.equal(scheduling.nextObjective, "await_choice");
assert.equal(scheduling.readiness, "ready");
assert.equal(scheduling.leadTemperature, "hot");

const readyLeadAskingPrice = advance(scheduling, "E quanto custa?");
assert.equal(readyLeadAskingPrice.readiness, "ready");
assert.equal(readyLeadAskingPrice.leadTemperature, "hot");

const qualifiedBodyLead = advance(
  emptyAiPublicSdrState(),
  "É minha primeira vez, a barriga me incomoda e prefiro sábado de manhã",
);
assert.equal(qualifiedBodyLead.qualification.concernArea, "abdomen");
assert.equal(qualifiedBodyLead.qualification.previousExperience, "first_time");
assert.equal(qualifiedBodyLead.qualification.previousExperienceKnown, true);
assert.equal(qualifiedBodyLead.qualification.preferredDayType, "saturday");
assert.equal(qualifiedBodyLead.qualification.preferredPeriod, "morning");

const qualifiedFacialLead = advance(
  qualifiedBodyLead,
  "Já fiz na Virtuosa e agora quero entender melhor o bigode chinês",
);
assert.equal(qualifiedFacialLead.qualification.concernArea, "nasolabial_fold");
assert.equal(qualifiedFacialLead.qualification.previousExperience, "virtuosa");

const afterName = advanceAiPublicSdrState({
  previous: emptyAiPublicSdrState(),
  latestClientMessage: "Vinicius",
  assistantMessages: ["Qual região do corpo mais te incomoda hoje?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(afterName.nextObjective, "discover_concern");

const afterNameWithPrematureModelState = advanceAiPublicSdrState({
  previous: emptyAiPublicSdrState(),
  proposed: {
    qualification: {
      concernArea: "other",
      previousExperience: "first_time",
      previousExperienceKnown: true,
    },
  },
  latestClientMessage: "Vinicius",
  assistantMessages: ["Qual região do corpo mais te incomoda hoje?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(afterNameWithPrematureModelState.qualification.concernArea, "unknown");
assert.equal(afterNameWithPrematureModelState.qualification.previousExperience, "unknown");
assert.equal(afterNameWithPrematureModelState.nextObjective, "discover_concern");

const afterConcern = advanceAiPublicSdrState({
  previous: afterName,
  latestClientMessage: "Abdômen",
  assistantMessages: ["É a sua primeira experiência com procedimentos estéticos ou você já realizou algum?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(afterConcern.qualification.concernArea, "abdomen");
assert.equal(afterConcern.nextObjective, "qualify_experience");
assert.equal(classifyAiPublicSdrIntent("Não", afterConcern), "other");

const firstTimeLead = advanceAiPublicSdrState({
  previous: afterConcern,
  latestClientMessage: "Não, nunca fiz",
  assistantMessages: [],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(firstTimeLead.qualification.previousExperience, "first_time");
assert.equal(firstTimeLead.nextObjective, "explain_campaign");
assert.notEqual(firstTimeLead.phase, "closed");

const afterCampaignExplanation = advanceAiPublicSdrState({
  previous: afterConcern,
  latestClientMessage: "Não, nunca fiz",
  assistantMessages: ["Entendi. O Hyper Slim promove contrações musculares em série para trabalhar tonificação e contorno corporal."],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(afterCampaignExplanation.nextObjective, "deepen_interest");

const experiencedLead = advanceAiPublicSdrState({
  previous: afterConcern,
  latestClientMessage: "Sim, já fiz",
  assistantMessages: ["Foi na Virtuosa ou em outra clínica?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(experiencedLead.qualification.previousExperience, "previous_unspecified");
assert.equal(experiencedLead.nextObjective, "clarify_experience_origin");

const otherClinicLead = advanceAiPublicSdrState({
  previous: experiencedLead,
  latestClientMessage: "Em outra clínica",
  assistantMessages: [],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(otherClinicLead.qualification.previousExperience, "other_clinic");
assert.equal(otherClinicLead.nextObjective, "explain_campaign");

assert.deepEqual(aiPublicCampaignDiscoveryGuide("Hyper Slim"), {
  track: "body",
  concernQuestion: "Qual região do corpo mais te incomoda hoje: abdômen, flancos, costas, braços, glúteos, culote ou outra região?",
  concernExamples: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "outra região"],
});
assert.equal(aiPublicCampaignDiscoveryGuide("Preenchimento Facial").track, "facial");
assert.match(aiPublicCampaignDiscoveryGuide("Botox").concernQuestion, /testa/);

const politeClose = advance(confirmedInterest, "agora não");
assert.equal(politeClose.latestIntent, "negative_response");
assert.equal(politeClose.phase, "closed");
assert.equal(politeClose.nextObjective, "close_politely");
assert.equal(politeClose.outcome, "not_now");

const earlyPoliteClose = advance(v1State, "não quero");
assert.equal(earlyPoliteClose.phase, "closed");
assert.equal(earlyPoliteClose.nextObjective, "close_politely");

const collectingPeriod = resolveAiPublicSchedulingTurn({
  previous: null,
  latestClientMessage: "Quero agendar uma avaliação",
});
assert.equal(collectingPeriod.state.status, "collecting_period");
assert.match(buildAiPublicSchedulingMessages(collectingPeriod)[0], /durante a semana ou no sábado/i);

const availableWeekdaySlots = [
  { date: "2026-08-06", time: "15:00" },
  { date: "2026-08-06", time: "17:00" },
];
assert.equal(aiPublicSchedulingPreferenceFromMessage("Durante a semana"), "weekday");
assert.equal(aiPublicSchedulingPreferenceFromMessage("No sábado"), "saturday");
const offeringSlots = resolveAiPublicSchedulingTurn({
  previous: collectingPeriod.state,
  latestClientMessage: "Durante a semana, à tarde",
  availableSlots: availableWeekdaySlots,
});
assert.equal(offeringSlots.state.status, "awaiting_confirmation");
assert.equal(offeringSlots.state.period, "afternoon");
assert.deepEqual(offeringSlots.state.offeredSlots, availableWeekdaySlots);
assert.match(buildAiPublicSchedulingMessages(offeringSlots)[0], /no período da tarde tenho disponibilidade quinta-feira, 06\/08, às 15:00 e às 17:00/i);

const resumedLegacyScheduling = resolveAiPublicSchedulingTurn({
  previous: { ...emptyAiPublicSchedulingState(), status: "collecting_period", preference: "weekday" },
  latestClientMessage: "tarde",
  availableSlots: availableWeekdaySlots,
  forceScheduling: true,
});
assert.equal(resumedLegacyScheduling.state.status, "awaiting_confirmation");
assert.equal(resumedLegacyScheduling.state.period, "afternoon");
assert.match(buildAiPublicSchedulingMessages(resumedLegacyScheduling)[0], /Consultei aqui e no período da tarde/i);

const confirmed = resolveAiPublicSchedulingTurn({
  previous: offeringSlots.state,
  latestClientMessage: "17h fica melhor",
});
assert.equal(confirmed.state.status, "confirmed");
assert.equal(confirmed.state.confirmedDate, "2026-08-06");
assert.equal(confirmed.state.confirmedTime, "17:00");
assert.match(buildAiPublicSchedulingMessages(confirmed)[0], /Nesta simulação/);
assert.match(buildAiPublicSchedulingMessages(confirmed)[0], /Nenhuma agenda real foi alterada/);
const bareHourConfirmation = resolveAiPublicSchedulingTurn({
  previous: offeringSlots.state,
  latestClientMessage: "15",
});
assert.equal(bareHourConfirmation.state.status, "confirmed");
assert.equal(bareHourConfirmation.state.confirmedTime, "15:00");
const completedSchedulingState = advanceAiPublicSdrState({
  previous: scheduling,
  latestClientMessage: "17h fica melhor",
  assistantMessages: ["Nesta simulação, registraríamos sua preferência."],
  scheduling: confirmed.state,
});
assert.equal(completedSchedulingState.phase, "closed");
assert.equal(completedSchedulingState.nextObjective, "complete_simulation");
assert.equal(completedSchedulingState.outcome, "simulated_evaluation_scheduled");

const noAvailability = resolveAiPublicSchedulingTurn({
  previous: collectingPeriod.state,
  latestClientMessage: "Sábado",
  availableSlots: [],
});
assert.equal(noAvailability.state.status, "collecting_period");
assert.equal(noAvailability.state.reason, "no_availability");
assert.match(buildAiPublicSchedulingMessages(noAvailability)[0], /Não encontrei duas opções livres/i);

const explanationOnly = resolveAiPublicSchedulingTurn({
  previous: null,
  latestClientMessage: "Como funciona a avaliação presencial?",
});
assert.equal(explanationOnly.active, false, "pergunta explicativa não deve iniciar o agendamento");

const regularPolicy = buildAiPublicResponsePolicy({
  latestClientMessage: "Quero saber mais",
  campaignNames: [],
  campaignItems: [],
  technicalItems: [],
  priceDiscussionAllowed: false,
});
const repetitionPolicy = buildAiPublicResponsePolicy({
  latestClientMessage: "Quero saber mais",
  campaignNames: [],
  campaignItems: [],
  technicalItems: [],
  priceDiscussionAllowed: false,
  recentAssistantMessages: ["Perfeito. Vou explicar.", "Entendi. Vamos continuar."],
});
assert.ok(
  validateAiPublicResponseDraft({ decision: "reply", messages: ["Perfeito. Posso explicar melhor?"] }, repetitionPolicy)
    .some((error) => error.includes("repetiu a abertura recente: perfeito")),
  "a resposta não deve repetir a abertura usada recentemente",
);
assert.ok(
  validateAiPublicResponseDraft({ decision: "reply", messages: ["Seu horário está confirmado. Posso ajudar em algo mais?"] }, regularPolicy)
    .some((error) => error.includes("fora do cenário simulado")),
  "o fluxo normal deve continuar bloqueando confirmação de agenda",
);

const confirmedSimulationPolicy = buildAiPublicResponsePolicy({
  latestClientMessage: "Sim, pode ser",
  campaignNames: [],
  campaignItems: [],
  technicalItems: [],
  priceDiscussionAllowed: false,
  requireQuestionAtEnd: false,
  simulatedSchedulingAllowed: true,
  simulatedSchedulingStatus: "confirmed",
});
assert.deepEqual(
  validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Prontinho. Nesta simulação, sua avaliação ficou reservada para segunda-feira às 14:00. Nenhuma agenda real foi alterada."],
  }, confirmedSimulationPolicy),
  [],
);
assert.ok(
  validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Prontinho. Sua avaliação ficou reservada para segunda-feira às 14:00."],
  }, confirmedSimulationPolicy).some((error) => error.includes("apenas na simulação")),
  "a confirmação simulada deve sempre expor seu caráter fictício",
);

console.log("Contrato SDR v4 e agenda simulada validados com cenários determinísticos.");
