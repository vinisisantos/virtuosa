const CONTRACT_UNIT_ALIASES = {
  Osasco: ['Osasco', 'Virtuosa Osasco'],
  SBC: ['SBC', 'Virtuosa São Bernardo', 'Virtuosa São Bernardo do Campo'],
  SCS: ['SCS', 'Virtuosa São Caetano do Sul'],
} as const;

export type ContractUnit = keyof typeof CONTRACT_UNIT_ALIASES;

function normalizeUnitLabel(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function canonicalContractUnit(value?: string | null): ContractUnit | null {
  if (!value) return null;

  const normalized = normalizeUnitLabel(value);
  if (normalized.includes('osasco')) return 'Osasco';
  if (normalized === 'sbc' || normalized.includes('sao bernardo')) return 'SBC';
  if (normalized === 'scs' || normalized.includes('sao caetano')) return 'SCS';
  return null;
}

export function contractUnitFilterValues(unit: string): string[] {
  const canonicalUnit = canonicalContractUnit(unit);
  return canonicalUnit ? [...CONTRACT_UNIT_ALIASES[canonicalUnit]] : [unit];
}
