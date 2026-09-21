import type { AiLearningUsage } from "@/lib/ai-learning/budget";
import { AI_LEARNING_MODEL, AiLearningError } from "@/lib/ai-learning/policy";

export function buildDeepSeekLearningRequest(instructions: string, input: unknown, schema: object) {
  return {
    model: AI_LEARNING_MODEL,
    instructions,
    input: JSON.stringify(input),
    reasoning: { effort: "none" },
    max_output_tokens: 3_000,
    text: {
      format: {
        type: "json_schema",
        name: "learning_candidates",
        strict: true,
        schema,
      },
    },
  };
}

export async function generateDeepSeekLearningJson(
  instructions: string,
  input: unknown,
  schema: object,
  usage: AiLearningUsage,
) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new AiLearningError("Credencial DeepSeek indisponível", 503);
  const body = buildDeepSeekLearningRequest(instructions, input, schema);
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 56_000) {
    throw new AiLearningError("Lote excedeu o contexto seguro", 413);
  }
  const response = await fetch("https://api.deepseek.com/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!response.ok) throw new AiLearningError("A DeepSeek não concluiu a extração", 502);
  const result = await response.json();
  usage.input += Number(result.usage?.input_tokens || 0);
  usage.output += Number(result.usage?.output_tokens || 0);
  if (result.status !== "completed") {
    throw new AiLearningError("A DeepSeek não terminou a extração com segurança", 502);
  }
  const parts = (result.output || []).flatMap(
    (item: { content?: { type: string; text?: string }[] }) => item.content || [],
  );
  if (parts.some((part: { type: string }) => part.type === "refusal")) {
    throw new AiLearningError("O lote exige revisão humana", 422);
  }
  const text = parts
    .filter((part: { type: string }) => part.type === "output_text")
    .map((part: { text?: string }) => part.text || "")
    .join("");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiLearningError("Resposta estruturada inválida", 502);
  }
}
