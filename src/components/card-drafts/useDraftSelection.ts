import { useCallback, useMemo, useState } from "react";

/**
 * Which drafts are checked. Only ids still listed count, so an approved or
 * dismissed draft that left the list after a refetch drops out by itself.
 */
export function useDraftSelection(ids: Array<string>) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const selected = useMemo(
    () => ids.filter((id) => checked.has(id)),
    [ids, checked],
  );
  const allSelected = ids.length > 0 && selected.length === ids.length;

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setChecked(allSelected ? new Set() : new Set(ids));
  }, [allSelected, ids]);

  const clear = useCallback(() => setChecked(new Set()), []);

  return {
    selected,
    isSelected: (id: string) => checked.has(id),
    allSelected,
    toggle,
    toggleAll,
    clear,
  };
}
