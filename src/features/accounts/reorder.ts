/** Move one item, returning a new array. Out-of-range moves return a copy unchanged. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

/**
 * Apply a new order of the visible ids to the full list (which may include hidden archived
 * accounts), keeping hidden ids in their current slots.
 */
export function mergeVisibleOrder(
  allIds: readonly string[],
  visibleInNewOrder: readonly string[],
): string[] {
  const visible = new Set(visibleInNewOrder);
  const queue = [...visibleInNewOrder];
  return allIds.map((id) => (visible.has(id) ? queue.shift()! : id));
}
