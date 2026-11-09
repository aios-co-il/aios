/** Preserves the existing assertHttpsUrl behavior at its extracted boundary. */
export function assertHttpsUrl(value: unknown, field: string): string {
  let url: URL;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error(`${field} חייב להיות קישור HTTPS תקין`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${field} חייב להיות קישור HTTPS תקין`);
  }
  return url.toString();
}
