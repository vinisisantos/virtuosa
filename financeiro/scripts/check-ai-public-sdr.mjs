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
  aiPublicSchedulingConsentFromMessage,
  aiPublicSchedulingNotBeforeFromMessage,
  aiPublicSchedulingWasOffered,
  buildAiPublicSchedulingMessages,
  emptyAiPublicSchedulingState,
  resolveAiPublicSchedulingTurn,
} from "../src/lib/ai-public-scheduling.ts";
import { parseAiPublicInlineGuidance } from "../src/lib/ai-public-inline-guidance.ts";
import {
  buildAiPublicResponsePolicy,
  normalizeAiPublicResponseDraftForDelivery,
  validateAiPublicResponseDraft,
} from "../src/lib/ai-public-response-policy.ts";
import {
  buildCampaignPriceMessages,
  resolveCampaignPrice,
} from "../src/lib/ai-campaign-price-policy.ts";

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
assert.equal(v1State.version, "public-sdr-v8");
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

const gluteDiscovery = advanceAiPublicSdrState({
  previous: emptyAiPublicSdrState(),
  latestClientMessage: "Vinicius",
  assistantMessages: ["Qual dessas situações mais te incomoda hoje?"],
  approvedCampaignName: "Harmonização de Glúteos",
});
const comprehensiveGluteConcern = advanceAiPublicSdrState({
  previous: gluteDiscovery,
  proposed: { qualification: { concernArea: "glutes" } },
  latestClientMessage: "tudo kkkk",
  assistantMessages: ["É a sua primeira experiência com esse procedimento ou você já fez antes?"],
  approvedCampaignName: "Harmonização de Glúteos",
});
assert.equal(comprehensiveGluteConcern.qualification.concernArea, "glutes");
assert.equal(comprehensiveGluteConcern.qualification.comprehensiveConcernKnown, true);
assert.equal(comprehensiveGluteConcern.nextObjective, "qualify_experience");

const firstTimeWithComprehensiveConcern = advanceAiPublicSdrState({
  previous: comprehensiveGluteConcern,
  latestClientMessage: "nunca fiz",
  assistantMessages: ["Posso consultar os horários disponíveis para sua avaliação?"],
  approvedCampaignName: "Harmonização de Glúteos",
});
assert.equal(firstTimeWithComprehensiveConcern.qualification.previousExperience, "first_time");
assert.equal(firstTimeWithComprehensiveConcern.nextObjective, "offer_next_step");
assert.equal(firstTimeWithComprehensiveConcern.outcome, "evaluation_offered");
assert.equal(classifyAiPublicSdrIntent("pode sim", firstTimeWithComprehensiveConcern), "positive_confirmation");

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
  assistantMessages: ["Você gostou da experiência e do resultado?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(experiencedLead.qualification.previousExperience, "previous_unspecified");
assert.equal(experiencedLead.nextObjective, "qualify_experience_satisfaction");

const positiveExperienceLead = advanceAiPublicSdrState({
  previous: experiencedLead,
  latestClientMessage: "Gostei bastante do resultado",
  assistantMessages: [],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(positiveExperienceLead.qualification.previousExperienceSatisfaction, "positive");
assert.equal(positiveExperienceLead.nextObjective, "explain_campaign");

const negativeExperienceLead = advanceAiPublicSdrState({
  previous: experiencedLead,
  latestClientMessage: "Não gostei",
  assistantMessages: ["Você lembra o que mais te incomodou no resultado?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(classifyAiPublicSdrIntent("Não gostei", experiencedLead), "other");
assert.equal(negativeExperienceLead.qualification.previousExperienceSatisfaction, "negative");
assert.equal(negativeExperienceLead.nextObjective, "understand_negative_experience");
assert.notEqual(negativeExperienceLead.phase, "closed");

const negativeExperienceExplained = advanceAiPublicSdrState({
  previous: negativeExperienceLead,
  latestClientMessage: "O resultado ficou artificial e pesado",
  assistantMessages: ["Podemos seguir para uma avaliação presencial?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(negativeExperienceExplained.qualification.previousExperienceConcernKnown, true);
assert.equal(negativeExperienceExplained.nextObjective, "offer_next_step");
assert.equal(negativeExperienceExplained.outcome, "evaluation_offered");

const legacyOriginLead = advanceAiPublicSdrState({
  previous: { ...experiencedLead, nextObjective: "clarify_experience_origin" },
  latestClientMessage: "Em outra clínica",
  assistantMessages: ["E você gostou do resultado?"],
  approvedCampaignName: "Hyper Slim",
});
assert.equal(legacyOriginLead.qualification.previousExperience, "other_clinic");
assert.equal(legacyOriginLead.nextObjective, "qualify_experience_satisfaction");

assert.deepEqual(aiPublicCampaignDiscoveryGuide("Hyper Slim"), {
  track: "body",
  concernQuestion: "Qual região do corpo mais te incomoda hoje: abdômen, flancos, costas, braços, glúteos, culote ou outra região?",
  concernExamples: ["abdômen", "flancos", "costas", "braços", "glúteos", "culote", "outra região"],
  forbiddenConcernTerms: ["rosto", "testa", "olheiras", "lábios", "bigode chinês", "queixo", "mandíbula", "bochechas"],
  experienceQuestion: "E me diz uma coisa: é a sua primeira vez fazendo um procedimento nessa região ou você já fez antes?",
  negativeExperienceOptions: [
    "o resultado ficou muito discreto",
    "ficou artificial",
    "durou menos do que você esperava",
    "não resolveu o que você queria",
    "outro motivo",
  ],
});
assert.equal(aiPublicCampaignDiscoveryGuide("Preenchimento Facial").track, "facial");
assert.match(aiPublicCampaignDiscoveryGuide("Botox").concernQuestion, /testa/);
assert.match(aiPublicCampaignDiscoveryGuide("Botox").experienceQuestion, /primeira vez fazendo Botox/i);
const barrigaGuide = aiPublicCampaignDiscoveryGuide("Barriga Trincada");
assert.match(barrigaGuide.concernQuestion, /abdômen, flancos/i);
assert.doesNotMatch(barrigaGuide.concernQuestion, /glúteos|braços|culote/i);
assert.ok(barrigaGuide.forbiddenConcernTerms.includes("glúteos"));
const gluteGuide = aiPublicCampaignDiscoveryGuide("Harmonização de Glúteos");
assert.match(gluteGuide.concernQuestion, /hip dips/i);
assert.doesNotMatch(gluteGuide.concernQuestion, /abdômen|flancos|braços/i);
assert.match(aiPublicCampaignDiscoveryGuide("Preenchimento Glúteo").concernQuestion, /hip dips/i);

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
assert.equal(aiPublicSchedulingConsentFromMessage("pode sim"), true);
assert.equal(aiPublicSchedulingWasOffered("Posso consultar os horários da avaliação para você?"), true);
assert.equal(aiPublicSchedulingWasOffered("Quer que eu explique como funciona a avaliação?"), false);
const offeringSlots = resolveAiPublicSchedulingTurn({
  previous: collectingPeriod.state,
  latestClientMessage: "Durante a semana, à tarde",
  availableSlots: availableWeekdaySlots,
});
assert.equal(offeringSlots.state.status, "awaiting_confirmation");
assert.equal(offeringSlots.state.period, "afternoon");
assert.deepEqual(offeringSlots.state.offeredSlots, availableWeekdaySlots);
assert.match(buildAiPublicSchedulingMessages(offeringSlots)[0], /no período da tarde tenho disponibilidade quinta-feira, 06\/08, às 15:00 e às 17:00/i);

const fridayAlternativeRequest = resolveAiPublicSchedulingTurn({
  previous: offeringSlots.state,
  latestClientMessage: "não tem outro horário na sexta?",
});
assert.equal(fridayAlternativeRequest.state.status, "collecting_period");
assert.equal(fridayAlternativeRequest.state.requestedWeekday, 5);
const fridayAlternativeSlots = [
  { date: "2026-08-07", time: "10:00" },
  { date: "2026-08-07", time: "12:00" },
];
const fridayAlternativeOffer = resolveAiPublicSchedulingTurn({
  previous: offeringSlots.state,
  latestClientMessage: "não tem outro horário na sexta?",
  availableSlots: fridayAlternativeSlots,
});
assert.equal(fridayAlternativeOffer.state.status, "awaiting_confirmation");
assert.equal(fridayAlternativeOffer.state.requestedWeekday, 5);
assert.deepEqual(fridayAlternativeOffer.state.offeredSlots, fridayAlternativeSlots);
assert.match(buildAiPublicSchedulingMessages(fridayAlternativeOffer)[0], /sexta-feira, 07\/08, às 10:00 e às 12:00/i);

const schedulingReferenceDate = new Date("2026-08-05T12:00:00-03:00");
assert.equal(
  aiPublicSchedulingNotBeforeFromMessage(
    "Nas próximas duas semanas eu não consigo, só vou conseguir daqui 3 semanas",
    schedulingReferenceDate,
  ),
  "2026-08-26",
);
assert.equal(aiPublicSchedulingNotBeforeFromMessage("daqui três semanas", schedulingReferenceDate), "2026-08-26");
assert.equal(aiPublicSchedulingNotBeforeFromMessage("mês que vem", schedulingReferenceDate), "2026-09-01");
assert.equal(aiPublicSchedulingNotBeforeFromMessage("a partir de 20/08", schedulingReferenceDate), "2026-08-20");
const threeWeeksAlternativeRequest = resolveAiPublicSchedulingTurn({
  previous: offeringSlots.state,
  latestClientMessage: "Nas próximas duas semanas eu não consigo, só vou conseguir daqui 3 semanas",
  now: schedulingReferenceDate,
});
assert.equal(threeWeeksAlternativeRequest.state.status, "collecting_period");
assert.equal(threeWeeksAlternativeRequest.state.requestedDate, "2026-08-26");
assert.deepEqual(threeWeeksAlternativeRequest.state.offeredSlots, availableWeekdaySlots);
const futureAlternativeSlots = [
  { date: "2026-08-27", time: "12:00" },
  { date: "2026-08-27", time: "16:00" },
];
const threeWeeksAlternativeOffer = resolveAiPublicSchedulingTurn({
  previous: offeringSlots.state,
  latestClientMessage: "Nas próximas duas semanas eu não consigo, só vou conseguir daqui 3 semanas",
  availableSlots: futureAlternativeSlots,
  now: schedulingReferenceDate,
});
assert.equal(threeWeeksAlternativeOffer.state.status, "awaiting_confirmation");
assert.equal(threeWeeksAlternativeOffer.state.requestedDate, "2026-08-26");
assert.deepEqual(threeWeeksAlternativeOffer.state.offeredSlots, futureAlternativeSlots);
assert.match(buildAiPublicSchedulingMessages(threeWeeksAlternativeOffer)[0], /a partir de quarta-feira, 26\/08/i);
assert.match(buildAiPublicSchedulingMessages(threeWeeksAlternativeOffer)[0], /quinta-feira, 27\/08, às 12:00 e às 16:00/i);
assert.doesNotMatch(buildAiPublicSchedulingMessages(threeWeeksAlternativeOffer)[0], /06\/08/);

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
const explicitDateConfirmation = resolveAiPublicSchedulingTurn({
  previous: offeringSlots.state,
  latestClientMessage: "06/08 às 15:00",
  now: schedulingReferenceDate,
});
assert.equal(explicitDateConfirmation.state.status, "confirmed");
assert.equal(explicitDateConfirmation.state.confirmedDate, "2026-08-06");
assert.equal(explicitDateConfirmation.state.confirmedTime, "15:00");
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
const semanticRepetitionPolicy = buildAiPublicResponsePolicy({
  latestClientMessage: "Sim",
  campaignNames: ["Barriga Trincada"],
  campaignItems: [],
  technicalItems: [],
  priceDiscussionAllowed: false,
  recentAssistantMessages: [
    "Na avaliação presencial, nossa especialista observa a região, entende o que mais incomoda e define com você a melhor estratégia dentro da proposta da Barriga Trincada. Ela também alinha a área de aplicação e o protocolo mais adequado antes de iniciar.",
  ],
});
assert.ok(
  validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Nessa avaliação, nossa especialista observa as regiões, entende o que mais incomoda e alinha a área de aplicação e a melhor estratégia da Barriga Trincada. Assim, define o protocolo adequado antes de iniciar. Posso explicar os itens?"],
  }, semanticRepetitionPolicy).some((error) => error.includes("repetiu semanticamente")),
  "a resposta não deve parafrasear uma explicação recente",
);
assert.ok(
  validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Na avaliação presencial eu observo a região e defino com você a melhor estratégia. Posso continuar?"],
  }, regularPolicy).some((error) => error.includes("primeira pessoa")),
  "a IA não pode falar como se realizasse a avaliação",
);
const barrigaScopePolicy = buildAiPublicResponsePolicy({
  latestClientMessage: "O que está incluído?",
  campaignNames: ["Barriga Trincada"],
  campaignItems: [],
  technicalItems: [],
  priceDiscussionAllowed: false,
  forbiddenCampaignConcernTerms: barrigaGuide.forbiddenConcernTerms,
});
assert.ok(
  validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["A campanha reúne os itens informados. Qual região mais te incomoda: abdômen, flancos ou glúteos?"],
  }, barrigaScopePolicy).some((error) => error.includes("fora do escopo da campanha: glúteos")),
  "Barriga Trincada não deve oferecer glúteos como opção",
);
assert.ok(
  validateAiPublicResponseDraft({ decision: "reply", messages: ["Seu horário está confirmado. Posso ajudar em algo mais?"] }, regularPolicy)
    .some((error) => error.includes("fora do cenário simulado")),
  "o fluxo normal deve continuar bloqueando confirmação de agenda",
);

const negativeExperienceWithOptions = normalizeAiPublicResponseDraftForDelivery({
  decision: "reply",
  messages: [
    "Entendo. Obrigada por compartilhar isso comigo. 😊\n\nVocê consegue me dizer o que mais te incomodou?\n\n• o resultado ficou muito discreto\n• ficou artificial\n• durou menos do que eu esperava\n• não resolveu o que eu queria\n• outro motivo",
  ],
}, regularPolicy);
assert.deepEqual(
  validateAiPublicResponseDraft(negativeExperienceWithOptions, regularPolicy),
  [],
  "uma pergunta seguida apenas por opções deve continuar sendo a pergunta final da interação",
);
assert.doesNotMatch(
  negativeExperienceWithOptions.messages[0],
  /especialista/i,
  "a normalização não deve criar oferta espontânea de especialista",
);
assert.ok(
  validateAiPublicResponseDraft({
    decision: "reply",
    messages: ["Você prefere continuar tirando dúvidas ou falar com a especialista?"],
  }, regularPolicy).some((error) => error.includes("encaminhamento humano")),
  "uma resposta normal não deve oferecer handoff como opção de continuidade",
);
assert.deepEqual(
  validateAiPublicResponseDraft({
    decision: "handoff",
    messages: ["Não tenho uma resposta segura para isso. Posso te encaminhar para uma especialista?"],
  }, regularPolicy),
  [],
  "o encaminhamento deve permanecer permitido quando a decisão real for handoff",
);

const priceMessages = buildCampaignPriceMessages({
  campaignName: "Botox",
  price: resolveCampaignPrice({ caption: "A partir de R$ 399,00" }),
});
assert.doesNotMatch(priceMessages[0], /especialista/i);
assert.match(priceMessages[0], /horários disponíveis para uma avaliação presencial/i);

assert.deepEqual(parseAiPublicInlineGuidance("{responda a objeção antes de voltar ao agendamento}"), {
  matched: true,
  guidance: "responda a objeção antes de voltar ao agendamento",
  error: null,
});
assert.equal(parseAiPublicInlineGuidance("isso é uma mensagem normal").matched, false);
assert.match(parseAiPublicInlineGuidance("{}").error || "", /pelo menos 5 caracteres/i);

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

console.log("Contrato SDR v8 e agenda simulada validados com cenários determinísticos.");
