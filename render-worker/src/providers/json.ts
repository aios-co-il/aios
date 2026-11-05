// Provider answers are untrusted JSON. Nothing checks their shape, so each type names only the
// fields its callers read, all optional, and every caller tests the ones it needs.

/** A provider's JSON answer, or {} when the body is not a JSON object. */
export async function providerJson<T extends object>(
  response: Pick<Response, "json">,
): Promise<Partial<T>> {
  return objectOf<T>(await response.json().catch(() => ({})));
}

/** A provider's JSON answer; a body that is not JSON throws, as `response.json()` does. */
export async function responseJson<T extends object>(
  response: Pick<Response, "json">,
): Promise<Partial<T>> {
  return objectOf<T>(await response.json());
}

/**
 * `body` when it is a JSON object (not null, not an array), else {}. The guard checks only the
 * top-level shape; the field types are not checked, so callers test each field they read.
 */
function objectOf<T extends object>(body: unknown): Partial<T> {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Partial<T>)
    : {};
}
