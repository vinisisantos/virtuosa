import assert from "node:assert/strict";
import {
  advanceAiPublicSdrState,
  classifyAiPublicSdrIntent,
  emptyAiPublicSdrState,
  normalizeAiPublicSdrState,
} from "../src/lib/ai-public-sdr.ts";

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
assert.equal(v1State.version, "public-sdr-v2");
assert.equal(v1State.campaignName, "Barriga Trincada");
assert.deepEqual(v1State.topicsCovered, ["campaign_overview", "procedure_function"]);

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

const politeClose = advance(confirmedInterest, "agora não");
assert.equal(politeClose.latestIntent, "negative_response");
assert.equal(politeClose.phase, "closed");
assert.equal(politeClose.nextObjective, "close_politely");
assert.equal(politeClose.outcome, "not_now");

const earlyPoliteClose = advance(v1State, "não quero");
assert.equal(earlyPoliteClose.phase, "closed");
assert.equal(earlyPoliteClose.nextObjective, "close_politely");

console.log("Contrato SDR v2 validado com cenários determinísticos.");
