/**
 * Puts columns in the saved order. A column missing from the saved order (one the
 * org turned on later) stays right after the column it follows by default.
 */
export function applyColumnOrder<T extends { id: string }>(
  columns: Array<T>,
  order: Array<string>,
): Array<T> {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const result = order.flatMap((id) => {
    const column = byId.get(id);
    return column ? [column] : [];
  });
  const placed = new Set(result.map((column) => column.id));

  columns.forEach((column, index) => {
    if (placed.has(column.id)) {
      return;
    }
    const previousId = index > 0 ? columns[index - 1].id : null;
    const insertAt = previousId
      ? result.findIndex((item) => item.id === previousId) + 1
      : 0;
    result.splice(insertAt, 0, column);
    placed.add(column.id);
  });

  return result;
}

/** Moves `fromId` into the position `toId` holds; unknown ids leave the order unchanged. */
export function moveColumnId(
  ids: Array<string>,
  fromId: string,
  toId: string,
): Array<string> {
  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return ids;
  }
  const next = [...ids];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, fromId);
  return next;
}
