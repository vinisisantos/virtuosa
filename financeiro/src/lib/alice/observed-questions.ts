/** Só classifica perguntas do texto efetivamente enviado; não infere respostas. */
export function observedAliceQuestions(text: string): string[] {
  if (!text.includes("?")) return [];
  const value = text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const patterns: [string, RegExp][] = [
    ["nome", /(?:qual|como).{0,20}(?:nome|chama)/u], ["queixa", /(?:o que|qual).{0,35}(?:incomoda|busca|objetivo|corrigir)/u],
    ["nivel", /(?:volume|resultado).{0,50}(?:natural|medio|grande|evidente)|(?:medio|grande).{0,35}volume/u],
    ["primeira_vez", /primeira vez|ja (?:fez|realizou|aplicou)/u], ["regiao", /qual regiao|onde.{0,25}(?:tratar|incomoda)/u],
    ["preferencia_dia", /prefere.{0,35}(?:semana|sabado|dia)/u], ["preferencia_horario", /(?:qual|prefere).{0,25}horario/u],
  ];
  return patterns.filter(([, pattern]) => pattern.test(value)).map(([key]) => key);
}
