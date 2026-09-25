export interface CampoContrato {
  tag: string;
  label: string;
  type: string;
}

const DEFAULT_LIMIT = 150;

function limitForField(field: CampoContrato): number {
  const tag = field.tag.toLocaleLowerCase('pt-BR');
  if (tag.includes('razao_social') || tag.includes('razão_social')) return 120;
  if (tag.includes('endereco') || tag.includes('endereço')) return 150;
  if (tag.includes('nome')) return 100;
  if (field.type === 'currency') return 200;
  return DEFAULT_LIMIT;
}

export function sanitizarTextoContrato(value: string): string {
  return value
    .replace(/\u200B/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\S{41,}/gu, (token) => token.match(/.{1,40}/gu)?.join('\u200B') ?? token);
}

export function prepararCamposContrato(
  fields: CampoContrato[],
  values: Record<string, string>,
): Record<string, string> {
  const prepared: Record<string, string> = {};
  const problems: string[] = [];

  for (const field of fields) {
    const normalized = String(values[field.tag] ?? '')
      .replace(/\u200B/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const limit = limitForField(field);
    if (normalized.length > limit) {
      problems.push(`${field.label}: ${normalized.length} caracteres; máximo ${limit}.`);
    }
    prepared[field.tag] = sanitizarTextoContrato(normalized);
  }

  if (problems.length) {
    throw new Error(`Corrija os campos antes de gerar o contrato:\n${problems.join('\n')}`);
  }
  return prepared;
}
