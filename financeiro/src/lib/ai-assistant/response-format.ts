const sentences = new Intl.Segmenter("pt-BR", { granularity: "sentence" });
const abbreviation = /(?:\b(?:dra?|sra?|profa?|av|aprox|etc)\.|(?:^|\s)[A-ZÀ-Ü]\.)$/iu;

function paragraphChunks(paragraph: string) {
  if (paragraph.length <= 360 || paragraph.includes("\n")) return [paragraph];
  const chunks: string[] = [];
  let current = "";
  for (const { segment } of sentences.segment(paragraph)) {
    const sentence = segment.trim();
    if (current.length >= 120 && current.length + sentence.length + 1 > 360 && !abbreviation.test(current)) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Apenas apresentação da sugestão: não altera mensagens recebidas ou textos já enviados.
export function formatAliceResponse(text: string, maxLength = 1_200) {
  const cleaned = text.replace(/\r\n?/g, "\n")
    .replace(/(?<=\S)[ \t]+(?:—|–|--)[ \t]+(?=\p{L})/gu, (separator, offset, original) => {
      const before = original.slice(0, offset).trimEnd();
      const after = original.slice(offset + separator.length);
      return /\d[\d.,]*$/u.test(before) && /^(?:R\$|US\$)\s*\d/u.test(after) ? separator : ", ";
    })
    .replace(/(?<=\p{L})[—–](?=\p{L})/gu, ", ")
    .trim();
  let extraBreaks = Math.max(0, maxLength - cleaned.length);
  return cleaned.split(/\n[ \t]*\n+/).map((paragraph) => paragraphChunks(paragraph).reduce((result, chunk, index) => {
    if (!index) return chunk;
    const separator = extraBreaks > 0 ? "\n\n" : " ";
    if (extraBreaks > 0) extraBreaks -= 1;
    return `${result}${separator}${chunk}`;
  }, "")).join("\n\n");
}
