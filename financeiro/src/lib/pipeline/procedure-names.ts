export function normalizeProcedureNames(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const uniqueNames = new Map<string, string>();

  for (const item of values) {
    if (typeof item !== "string") continue;
    const name = item.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    if (!uniqueNames.has(key)) uniqueNames.set(key, name);
  }

  return [...uniqueNames.values()];
}

export function formatProcedureNames(value: unknown): string {
  return normalizeProcedureNames(value).join(" + ");
}
