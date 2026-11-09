type ConnectionUserFilter<Query> = {
  eq(column: "connection_user_id", value: string): Query;
  is(column: "connection_user_id", value: null): Query;
};

/**
 * Limits a query to one connection user's rows. A null user means rows with
 * no connection user: PostgREST only matches SQL NULL with `is`, never `eq`.
 */
export function whereConnectionUser<Query>(
  query: ConnectionUserFilter<Query>,
  connectionUserId: string | null,
): Query {
  if (connectionUserId === null) {
    return query.is("connection_user_id", null);
  }
  return query.eq("connection_user_id", connectionUserId);
}
