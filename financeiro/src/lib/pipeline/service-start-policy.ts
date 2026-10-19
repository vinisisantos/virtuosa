const COMMERCIAL_UNITS = new Map([
  ["osasco", "Osasco"],
  ["sbc", "SBC"],
  ["scs", "SCS"],
]);

export function normalizedPipelineStageName(value?: string | null) {
  return (value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

export function isNewLeadPipelineStage(value?: string | null) {
  return ["novo_lead", "entrada"].includes(normalizedPipelineStageName(value));
}

export function resolveServiceStartUnit(
  contactUnit?: string | null,
  instanceUnit?: string | null,
) {
  // O contato é global e pode manter a unidade histórica de outra caixa.
  for (const value of [instanceUnit, contactUnit]) {
    const canonicalUnit = COMMERCIAL_UNITS.get((value || "").trim().toLocaleLowerCase("pt-BR"));
    if (canonicalUnit) return canonicalUnit;
  }
  return null;
}
