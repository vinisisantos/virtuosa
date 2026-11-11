/** Reconhece a frase inteira; não apaga ressalvas para fabricar um aceite. */
export function evaluationReplyAffirms(text: string) {
  const value = text.normalize('NFKD').replace(/\p{Diacritic}|\p{Cf}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
  return /^(?:sim|pode|pode ser|pode sim|sim pode|sim pode ser|ok|certo|combinado|confirmo|fechado|prefiro|eu prefiro|quero|eu quero|quero agendar|pode agendar|pode marcar|(?:(?:pra|para) mim )?(?:ta bom|esta bom|fica bom|ta otimo|esta otimo|serve|funciona))$/u.test(value);
}
