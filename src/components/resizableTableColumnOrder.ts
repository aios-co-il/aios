/** Reads a saved column-id order; anything malformed reads as no saved order. */
export function parseColumnOrder(
  raw: string | null | undefined,
): Array<string> {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** The saved order for `key`, or none when storage is unavailable. */
export function readColumnOrder(
  storage: Pick<Storage, "getItem"> | null | undefined,
  key: string,
): Array<string> {
  try {
    return parseColumnOrder(storage?.getItem(key) ?? null);
  } catch {
    return [];
  }
}

/** Saves the order; a blocked or full storage keeps the order for this visit only. */
export function writeColumnOrder(
  storage: Pick<Storage, "setItem"> | null | undefined,
  key: string,
  order: Array<string>,
): void {
  try {
    storage?.setItem(key, JSON.stringify(order));
  } catch (error) {
    console.warn("Could not save table column order", error);
  }
}

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
