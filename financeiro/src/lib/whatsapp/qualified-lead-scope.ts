export function qualifiedLeadInstanceFilter(unit?: string) {
  return {
    capturesLeads: true,
    ...(unit ? { unit } : {}),
  };
}
