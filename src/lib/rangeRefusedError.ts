/**
 * A share endpoint's 400 for the picked window (public-dashboard and
 * public-table refuse a malformed or too long custom range). The page keeps
 * its date controls and asks for another window instead of calling the link
 * broken.
 */
export class RangeRefusedError extends Error {
  constructor(detail: string) {
    super(detail || "range_refused");
    this.name = "RangeRefusedError";
  }
}

/**
 * The error for a failed share endpoint answer: a RangeRefusedError for 400,
 * otherwise an Error carrying the body.
 */
export async function shareResponseError(
  res: Response,
  endpoint: string,
): Promise<Error> {
  const body = await res.text();
  if (res.status === 400) {
    return new RangeRefusedError(body);
  }
  return new Error(body || `${endpoint} failed (${res.status})`);
}
