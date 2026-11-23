export type EntityAssignmentOption = {
  id: string;
  label: string;
  description?: string | null;
};

export function filterEntityAssignmentOptions<T extends EntityAssignmentOption>(
  options: ReadonlyArray<T>,
  search: string,
): Array<T> {
  const term = search.trim().toLocaleLowerCase("he");
  if (!term) return [...options];
  return options.filter((option) =>
    `${option.label} ${option.description || ""}`
      .toLocaleLowerCase("he")
      .includes(term),
  );
}

export function toggleEntityAssignmentId(
  selectedIds: ReadonlyArray<string>,
  id: string,
  multiple: boolean,
): Array<string> {
  if (!multiple) return [id];
  return selectedIds.includes(id)
    ? selectedIds.filter((selectedId) => selectedId !== id)
    : [...selectedIds, id];
}
