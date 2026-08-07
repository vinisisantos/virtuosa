export const AI_CURRENT_MODEL_SPEC = "openai:gpt-5.6-terra";

type OpenAiResponsesRequestParams = {
  model: string;
  instructions: string;
  input: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export function buildOpenAiResponsesRequest(params: OpenAiResponsesRequestParams) {
  const base = {
    model: params.model,
    instructions: params.instructions,
    input: params.input,
    max_output_tokens: params.maxOutputTokens ?? 1_200,
  };

  if (params.model.startsWith("gpt-5.6")) {
    return {
      ...base,
      store: false,
      reasoning: { effort: "low", context: "current_turn" },
      text: { verbosity: "low" },
    };
  }

  return {
    ...base,
    temperature: params.temperature ?? 0.35,
  };
}
