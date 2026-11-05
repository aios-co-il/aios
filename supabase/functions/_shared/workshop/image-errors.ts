/**
 * How an image provider's failure is reported: a short provider answer, and a mark on a job the
 * provider already accepted so the next engine is not tried.
 */

export const clip = (value: string) => value.replace(/\s+/g, " ").slice(0, 220);

/** The provider holds a paid job: trying the next engine could charge for the picture twice. */
export function accepted(error: unknown) {
  const tagged = error instanceof Error ? error : new Error(String(error));
  (tagged as Error & { accepted?: boolean }).accepted = true;
  return tagged;
}
