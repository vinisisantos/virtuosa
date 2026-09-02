const PORTUGUESE_MONTHS = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

function isValidYear(year: number) {
  return Number.isInteger(year) && year >= 1900 && year <= 2100;
}

function formatReferenceMonth(year: number, month: number) {
  if (!isValidYear(year) || !Number.isInteger(month) || month < 1 || month > 12) return undefined;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function normalizeCostReferenceMonth(input: unknown, fallbackYear?: number) {
  if (typeof input !== 'string') return undefined;
  const value = input.trim();
  if (!value) return undefined;

  const canonicalMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (canonicalMatch) return formatReferenceMonth(Number(canonicalMatch[1]), Number(canonicalMatch[2]));

  const numericMatch = value.match(/^(\d{1,2})[/.\-](\d{4})$/);
  if (numericMatch) return formatReferenceMonth(Number(numericMatch[2]), Number(numericMatch[1]));

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
  const monthIndex = PORTUGUESE_MONTHS.findIndex(month => new RegExp(`\\b${month}\\b`).test(normalized));
  if (monthIndex < 0) return undefined;

  const explicitYear = normalized.match(/\b(19\d{2}|20\d{2}|2100)\b/);
  const year = explicitYear ? Number(explicitYear[1]) : fallbackYear;
  return year === undefined ? undefined : formatReferenceMonth(year, monthIndex + 1);
}

export function resolveCostReferenceMonth(input: unknown, dueDate?: string | null, fallbackYear?: number) {
  const dueYearMatch = dueDate?.match(/^(\d{4})-/);
  const dueYear = dueYearMatch ? Number(dueYearMatch[1]) : undefined;
  return normalizeCostReferenceMonth(input, dueYear ?? fallbackYear);
}

export function costEntryMatchesMonth(
  referenceMonth: unknown,
  dueDate: string | null | undefined,
  year: number,
  zeroBasedMonth: number,
) {
  const targetMonth = formatReferenceMonth(year, zeroBasedMonth + 1);
  if (!targetMonth) return false;
  const resolvedReferenceMonth = resolveCostReferenceMonth(referenceMonth, dueDate, year);
  return resolvedReferenceMonth
    ? resolvedReferenceMonth === targetMonth
    : Boolean(dueDate?.startsWith(targetMonth));
}
