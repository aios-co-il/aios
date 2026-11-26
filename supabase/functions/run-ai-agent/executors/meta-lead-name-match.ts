export function metaNameMatches(value: unknown, query: unknown): boolean {
  const v = normalize(value);
  const q = normalize(query);
  return !!v && !!q && (v === q || v.includes(q));
}

function normalize(input: unknown) {
  return String(input || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\-_–—"'׳״()[\]{}]+/g, "");
}
