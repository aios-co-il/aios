/** How a mailing list keeps its members: `static` (only explicit adds /
 * removes), `synced` (the database adds / removes CRM matches on every
 * change) or `dynamic` (resolved from its filter at send time). */
export type ListKind = "static" | "synced" | "dynamic";

/** The list's kind, read from the `kind` column (unknown values are static). */
export function listKind(list: { kind: string }): ListKind {
  return list.kind === "synced" || list.kind === "dynamic"
    ? list.kind
    : "static";
}
