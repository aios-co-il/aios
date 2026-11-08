/**
 * What the tenant's Carmen (Manus) line adds to the Green lines' reads
 * (AIO-515): its groups no Green line read. A group both kinds of line are in
 * is read from the Green line, which stores the staff's typed replies as its
 * own; read twice, each message would count twice. Direct chats on Carmen's
 * line are people talking to Carmen, not client threads, so they are left out.
 */

/** The fields of an activity row the merge reads. */
type ThreadRow = {
  thread_key: string;
  thread_kind: string;
  direction: string;
  sent_by_user_id: string | null;
};

/**
 * Carmen's group rows in threads `green` does not hold. An outbound row is
 * Carmen's line sending: it counts only when a person sent it from AIOS
 * (sent_by_user_id), never as a staff reply on its own.
 */
export function carmenGroupRows<T extends ThreadRow>(
  carmen: Array<T>,
  green: Array<ThreadRow>,
): Array<T> {
  const read = new Set(green.map((row) => row.thread_key));
  return carmen.filter(
    (row) =>
      row.thread_kind === "group" &&
      !read.has(row.thread_key) &&
      (row.direction !== "outbound" || row.sent_by_user_id !== null),
  );
}

/** Carmen's groups (by group_id) that `green` does not hold. */
export function carmenOnlyGroups<T extends { group_id: string | null }>(
  carmen: Array<T>,
  green: Array<{ group_id: string | null }>,
): Array<T> {
  const read = new Set(green.map((group) => group.group_id));
  return carmen.filter((group) => !read.has(group.group_id));
}
