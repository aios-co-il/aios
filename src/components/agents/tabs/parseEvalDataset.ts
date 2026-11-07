/** Preserve the eval editor's JSON syntax and array-shape errors. */
export function parseEvalDataset(value: string) {
  let dataset: unknown;
  try {
    dataset = JSON.parse(value);
  } catch {
    throw new Error("JSON לא תקין");
  }
  if (!Array.isArray(dataset)) {
    throw new Error("ה-dataset חייב להיות מערך");
  }
  return dataset;
}
