/** Locally created entries that a newer remote snapshot does not contain yet. */
export function pendingCostAdditions<T extends { id: number }>(local: T[], remote: T[], addedIds: ReadonlySet<number>) {
  const remoteIds = new Set(remote.map(item => item.id));
  return local.filter(item => addedIds.has(item.id) && !remoteIds.has(item.id));
}
