/** Preserves the existing metaNameMatches behavior at its extracted boundary. */
export function metaNameMatches(value: unknown, query: unknown): boolean {
  /** Retains the original normalize helper. */
  function normalize(input: unknown) {
    return String(input || "")
      .trim()
      .toLocaleLowerCase()
      .replace(/[\s\-_–—"'׳״()[\]{}]+/g, "");
  }
  const v = normalize(value);
  const q = normalize(query);
  return !!v && !!q && (v === q || v.includes(q));
}
