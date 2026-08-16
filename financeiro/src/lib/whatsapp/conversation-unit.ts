export function resolveInboxConversationUnit(
  instanceUnit?: string | null,
  selectedUnit?: string | null,
  contactUnit?: string | null,
) {
  for (const value of [instanceUnit, selectedUnit, contactUnit]) {
    const normalized = (value || "").trim();
    if (normalized && normalized !== "all" && normalized !== "Todas") return normalized;
  }
  return "";
}
