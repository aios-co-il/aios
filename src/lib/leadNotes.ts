export function normalizeLeadNotes(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function patchLeadNotesInCache(
  old: unknown,
  leadId: string,
  notes: string | null,
): unknown {
  if (!old) return old;
  if (Array.isArray(old)) {
    return old.map((lead) =>
      lead &&
      typeof lead === "object" &&
      (lead as { id?: string }).id === leadId
        ? { ...lead, notes }
        : lead,
    );
  }
  if (typeof old !== "object") return old;

  const updated: Record<string, unknown> = {
    ...(old as Record<string, unknown>),
  };
  for (const key of Object.keys(updated)) {
    const value = updated[key];
    if (Array.isArray(value)) {
      updated[key] = patchLeadNotesInCache(value, leadId, notes);
      continue;
    }
    if (
      value &&
      typeof value === "object" &&
      Array.isArray((value as { leads?: unknown }).leads)
    ) {
      const stage = value as { leads: unknown[] };
      updated[key] = {
        ...stage,
        leads: patchLeadNotesInCache(stage.leads, leadId, notes),
      };
    }
  }
  return updated;
}
