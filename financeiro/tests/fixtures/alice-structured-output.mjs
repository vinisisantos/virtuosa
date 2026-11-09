export function structuredOutput(changes = {}) {
  return {
    resposta: ["Entendi! Vou seguir do ponto em que paramos.\n\nVocê prefere durante a semana ou no sábado?"],
    memoria: { resumo: "A cliente informou interesse na região abdominal." },
    seApresentouNestaResposta: false, escalarHumano: false, confidence: "high", usedKnowledge: [], ...changes,
  };
}

export function providerResult(output = structuredOutput(), changes = {}) {
  return {
    model: "claude-sonnet-4-6", stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
    content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }], ...changes,
  };
}

export function providerResponse(output, changes) {
  return new Response(JSON.stringify(providerResult(output, changes)), { status: 200 });
}
