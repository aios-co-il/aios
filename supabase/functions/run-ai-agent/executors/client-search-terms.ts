/** Expand Hebrew/English aliases so "קרנליוס" / Cornelius / Kernelios all match. */
export function expandClientSearchTerms(raw: string): Array<string> {
  const term = String(raw || "").trim();
  if (!term) {
    return [];
  }
  const terms = new Set<string>([term]);
  const lower = term.toLocaleLowerCase("he");
  const aliasGroups = [
    [
      "kernelios",
      "kernel",
      "cornelius",
      "קרנליוס",
      "קרניליוס",
      "yael kernelios",
      "edvard kernelios",
      "KERNELIOS",
    ],
  ];
  for (const group of aliasGroups) {
    if (
      group.some(
        (alias) =>
          lower.includes(alias.toLocaleLowerCase("he")) ||
          alias.toLocaleLowerCase("he").includes(lower),
      )
    ) {
      for (const alias of group) {
        terms.add(alias);
      }
    }
  }
  // Common Hebrew typo: קרנליוס ↔ קרניליוס
  if (/קרנל/.test(term)) {
    terms.add("קרנליוס");
    terms.add("קרניליוס");
    terms.add("KERNELIOS");
    terms.add("Cornelius");
  }
  return Array.from(terms);
}
