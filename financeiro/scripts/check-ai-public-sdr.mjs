import assert from "node:assert/strict";
import {
  advanceAiPublicSdrState,
  classifyAiPublicSdrIntent,
  emptyAiPublicSdrState,
  normalizeAiPublicSdrState,
} from "../src/lib/ai-public-sdr.ts";
import {
  aiPublicEvaluationSlots,
  buildAiPublicSchedulingMessages,
  emptyAiPublicSchedulingState,
  isAiPublicEvaluationSlotAvailable,
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
  topicsCovered: ["campaign_overview", "procedure_function"],
  nextObjective: "deepen_interest",
  turnCount: 2,
});
assert.equal(v1State.version, "public-sdr-v3");
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

const politeClose = advance(confirmedInterest, "agora não");
assert.equal(politeClose.latestIntent, "negative_response");
assert.equal(politeClose.phase, "closed");
assert.equal(politeClose.nextObjective, "close_politely");
assert.equal(politeClose.outcome, "not_now");

const earlyPoliteClose = advance(v1State, "não quero");
assert.equal(earlyPoliteClose.phase, "closed");
assert.equal(earlyPoliteClose.nextObjective, "close_politely");

const monday = "2026-08-03";
const saturday = "2026-08-08";
assert.deepEqual(aiPublicEvaluationSlots(monday), [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00",
  "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
]);
assert.deepEqual(aiPublicEvaluationSlots(saturday), ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"]);
assert.deepEqual(aiPublicEvaluationSlots("2026-08-09"), []);

const sessionSeed = "session-sdr-scheduling-test";
const availableTime = aiPublicEvaluationSlots(monday)
  .find((time) => isAiPublicEvaluationSlotAvailable(sessionSeed, monday, time));
const unavailableTime = aiPublicEvaluationSlots(monday)
  .find((time) => !isAiPublicEvaluationSlotAvailable(sessionSeed, monday, time));
assert.ok(availableTime, "deve existir ao menos um horário disponível no cenário determinístico");
assert.ok(unavailableTime, "deve existir ao menos um horário indisponível no cenário determinístico");

const collectingDate = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: null,
  latestClientMessage: "Quero agendar uma avaliação",
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(collectingDate.state.status, "collecting_date");

const collectingTime = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: collectingDate.state,
  latestClientMessage: "Pode ser amanhã",
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(collectingTime.state.status, "collecting_time");
assert.equal(collectingTime.state.requestedDate, monday);

const availableRequest = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: collectingTime.state,
  latestClientMessage: `Às ${availableTime}`,
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(availableRequest.state.status, "awaiting_confirmation");
assert.equal(availableRequest.state.offeredTime, availableTime);

const confirmed = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: availableRequest.state,
  latestClientMessage: "Sim, pode ser",
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(confirmed.state.status, "confirmed");
assert.equal(confirmed.state.confirmedDate, monday);
assert.equal(confirmed.state.confirmedTime, availableTime);
assert.match(buildAiPublicSchedulingMessages(confirmed)[0], /Nesta simulação/);
assert.match(buildAiPublicSchedulingMessages(confirmed)[0], /03\/08\/2026/);
assert.ok(buildAiPublicSchedulingMessages(confirmed)[0].includes(availableTime));
const completedSchedulingState = advanceAiPublicSdrState({
  previous: scheduling,
  latestClientMessage: "Sim, pode ser",
  assistantMessages: ["Nesta simulação, sua avaliação ficou reservada."],
  scheduling: confirmed.state,
});
assert.equal(completedSchedulingState.phase, "closed");
assert.equal(completedSchedulingState.nextObjective, "complete_simulation");
assert.equal(completedSchedulingState.outcome, "simulated_evaluation_scheduled");

const unavailableRequest = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: collectingTime.state,
  latestClientMessage: `Às ${unavailableTime}`,
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(unavailableRequest.state.status, "alternative_offered");
assert.equal(unavailableRequest.state.reason, "requested_unavailable");
assert.notEqual(unavailableRequest.state.offeredTime, unavailableTime);

const sundayRequest = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: collectingDate.state,
  latestClientMessage: "Domingo às 11:00",
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(sundayRequest.state.status, "alternative_offered");
assert.equal(sundayRequest.state.reason, "closed_day");
assert.equal(sundayRequest.state.offeredDate, monday);

const outsideHours = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: collectingDate.state,
  latestClientMessage: "Segunda às 19:00",
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(outsideHours.state.status, "alternative_offered");
assert.equal(outsideHours.state.reason, "outside_hours");

const explanationOnly = resolveAiPublicSchedulingTurn({
  sessionSeed,
  previous: null,
  latestClientMessage: "Como funciona a avaliação presencial?",
  now: new Date("2026-08-02T15:00:00-03:00"),
});
assert.equal(explanationOnly.active, false, "pergunta explicativa não deve iniciar o agendamento");

const regularPolicy = buildAiPublicResponsePolicy({
  latestClientMessage: "Quero saber mais",
  campaignNames: [],
  campaignItems: [],
  technicalItems: [],
  priceDiscussionAllowed: false,
});
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

console.log("Contrato SDR v3 e agenda simulada validados com cenários determinísticos.");
