import { buildOpenAiResponsesRequest } from "@/lib/ai-model-config";
import {
  checkInputSize,
  DIMENSIONS,
  EMBEDDING_MODEL,
  InboxAiError,
  MODEL,
  vectorLiteral,
} from "./policy";
import type { Usage } from "./budget";

async function call(path: string, body: unknown) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new InboxAiError("Credencial de IA indisponível", 503);
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new InboxAiError(
      "A IA não concluiu a solicitação; tente mais tarde",
      502,
    );
  return response.json();
}

export async function embed(texts: string[], usage: Usage) {
  if (!texts.length) return [];
  for (const text of texts) checkInputSize(text, 8000);
  checkInputSize(texts, 24000);
  const result = await call("embeddings", {
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: DIMENSIONS,
    encoding_format: "float",
  });
  usage.embedding += result.usage?.total_tokens || 0;
  if (!Array.isArray(result.data) || result.data.length !== texts.length)
    throw new InboxAiError("Indexação incompleta", 502);
  const ordered = result.data.sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index,
  );
  return ordered.map(
    (item: { embedding: number[]; index: number }, i: number) => {
      if (item.index !== i) throw new InboxAiError("Indexação inválida", 502);
      vectorLiteral(item.embedding);
      return item.embedding;
    },
  ) as number[][];
}

export async function generateJson(
  instructions: string,
  input: unknown,
  schema: object,
  limits: { input: number; output: number },
  usage: Usage,
) {
  const body = {
    ...buildOpenAiResponsesRequest({
      model: MODEL,
      instructions,
      input: JSON.stringify(input),
      maxOutputTokens: limits.output,
    }),
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "inbox_result",
        strict: true,
        schema,
      },
    },
  };
  checkInputSize(body, limits.input);
  const result = await call("responses", body);
  usage.input += result.usage?.input_tokens || 0;
  usage.output += result.usage?.output_tokens || 0;
  if (result.status !== "completed")
    throw new InboxAiError("A IA não terminou a resposta com segurança", 502);
  const parts = (result.output || []).flatMap(
    (item: { content?: { type: string; text?: string }[] }) =>
      item.content || [],
  );
  if (parts.some((part: { type: string }) => part.type === "refusal"))
    throw new InboxAiError("Esta pergunta precisa de avaliação humana", 422);
  const text = parts
    .filter((part: { type: string }) => part.type === "output_text")
    .map((part: { text: string }) => part.text)
    .join("");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InboxAiError("Resposta inválida da IA", 502);
  }
}
