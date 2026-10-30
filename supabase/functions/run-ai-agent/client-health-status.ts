// The mood_status write of Carmen's update_client_health and
// batch_update_client_health tools (AIO-232).

import type { Database } from "../_shared/database.types.ts";

type ClientMoodStatus = Database["public"]["Enums"]["client_mood_status"];

type TenantCanWriteClient =
  Database["public"]["Functions"]["tenant_can_write_client"];

type DbError = { message: string };

/**
 * The calls setClientMoodStatus makes. DbClient fits it, and so does a test
 * fake, which cannot build supabase-js's query builders without a cast. The
 * update filters with match(): eq()'s generic column type cannot be compared
 * structurally (TS2589), and match({ id }) sends the same id=eq filter.
 */
type ClientMoodStatusDb = {
  rpc(
    fn: "tenant_can_write_client",
    args: TenantCanWriteClient["Args"],
  ): PromiseLike<{
    data: TenantCanWriteClient["Returns"] | null;
    error: DbError | null;
  }>;
  from(table: "clients"): {
    update(values: { mood_status: ClientMoodStatus }): {
      match(query: { id: string }): {
        select(columns: "id"): PromiseLike<{
          data: { id: string }[] | null;
          error: DbError | null;
        }>;
      };
    };
  };
};

/**
 * Sets a client's mood_status when the caller's tenant may write on it
 * (tenant_can_write_client: its own client, or one of an agency shared with it
 * read_write). Otherwise it throws before any write, so the tool fails before
 * it writes the communication log and card entry instead of reporting a
 * health update that did not happen. A read_only share sees the client but
 * never changes it.
 */
export async function setClientMoodStatus(
  supabase: ClientMoodStatusDb,
  input: {
    tenantId: string;
    clientId: string;
    moodStatus: ClientMoodStatus;
  },
): Promise<void> {
  const { data: canWrite, error: accessError } = await supabase.rpc(
    "tenant_can_write_client",
    { p_tenant: input.tenantId, p_client: input.clientId },
  );
  if (accessError) {
    throw accessError;
  }
  if (!canWrite) {
    throw new Error("אין לארגון הזה הרשאת עריכה ללקוח — מצב הבריאות לא עודכן");
  }
  const { data, error } = await supabase
    .from("clients")
    .update({ mood_status: input.moodStatus })
    .match({ id: input.clientId })
    .select("id");
  if (error) {
    throw error;
  }
  if (!data?.length) {
    throw new Error("הלקוח לא נמצא — מצב הבריאות לא עודכן");
  }
}
