/**
 * The `connection_user_id` filter of a chat query. An integration without a
 * user stores NULL there, which `eq` never matches, so that case uses `is`.
 */
export function connectionUserFilter(
  connectionUserId: string | null,
): ["connection_user_id", "eq" | "is", string | null] {
  return connectionUserId
    ? ["connection_user_id", "eq", connectionUserId]
    : ["connection_user_id", "is", null];
}
