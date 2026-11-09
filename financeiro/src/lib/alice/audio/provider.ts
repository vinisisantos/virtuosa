export type AliceAudioProviderResult = { text: string; languages: { code: string }[] };

export async function transcribeAliceAudio(file: File): Promise<AliceAudioProviderResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("audio_provider_unconfigured");
  const body = new FormData();
  body.append("model", "gpt-transcribe");
  body.append("file", file);
  body.append("languages[]", "pt");
  // Sem retry: timeout/erro depois do POST não comprova que o provedor não cobrou.
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body,
    signal: AbortSignal.timeout(30_000), redirect: "error", cache: "no-store",
  });
  if (!response.ok) throw new Error(`audio_provider_http_${response.status}`);
  if (Number(response.headers.get("content-length")) > 32_000) throw new Error("audio_provider_invalid_result");
  const result = await response.json();
  if (typeof result.text !== "string" || !Array.isArray(result.languages)) throw new Error("audio_provider_invalid_result");
  return result;
}
