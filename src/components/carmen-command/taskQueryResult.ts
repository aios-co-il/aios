/** Optional cron reads may hide an explicit access denial, but not a failed service. */
export async function dataOrEmpty<T>(
  query: PromiseLike<{ data: Array<T> | null; error: unknown }>,
  optional = false,
): Promise<Array<T>> {
  try {
    const result = await query;
    if (result.error) {
      throw result.error;
    }
    return result.data ?? [];
  } catch (error) {
    if (!optional || !isCronPermissionDenied(error)) {
      throw error;
    }
    console.warn("[carmen-tasks] optional cron access denied", error);
    return [];
  }
}
/** The cron RPC raises P0001 for its explicit permission check; PostgREST can use 42501. */
function isCronPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  return (
    code === "42501" || (code === "P0001" && message === "permission denied")
  );
}
