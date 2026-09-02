const ALL_UNIT_VALUES = new Set(['all', 'todas']);

function normalizeSpecificUnit(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || ALL_UNIT_VALUES.has(normalized.toLocaleLowerCase('pt-BR'))) return '';
  return normalized;
}

export function resolveCostEntryUnit(selectedUnit: unknown, fallbackUnit: unknown) {
  return normalizeSpecificUnit(selectedUnit) || normalizeSpecificUnit(fallbackUnit);
}
