function normalizeTag(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function addClientTag(currentTags: string | null | undefined, tag: string) {
  const nextTag = tag.trim().replace(/\s+/g, " ");
  if (!nextTag) return currentTags?.trim() || null;

  const tags = (currentTags || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (tags.some((value) => normalizeTag(value) === normalizeTag(nextTag))) return tags.join(",");
  tags.push(nextTag);
  return tags.join(",");
}
