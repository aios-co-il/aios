// The public link a scheduled report sends: the share of its table or
// dashboard.
import type { Tables } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

type ScheduleForShare = Pick<
  Tables<"report_schedules">,
  "tenant_id" | "target_type" | "created_by"
>;

/**
 * The public URL of the schedule's table or dashboard: its tenant's latest
 * share, switched back on when someone switched it off, else a new share in
 * the schedule creator's name. Only the schedule tenant's shares count: a
 * member writes the schedule's table_id/dashboard_id, which nothing ties to
 * its tenant yet (AIO-126).
 */
export async function ensureReportShare(
  admin: DbClient,
  schedule: ScheduleForShare,
  targetId: string,
): Promise<string> {
  const isTable = schedule.target_type === "table";
  const shareTable = isTable ? "table_shares" : "dashboard_shares";
  const targetColumn = isTable ? "table_id" : "dashboard_id";
  const { data: share, error } = await admin
    .from(shareTable)
    .select("share_token, is_active")
    .eq(targetColumn, targetId)
    .eq("tenant_id", schedule.tenant_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (share && !share.is_active) {
    const { error: updateError } = await admin
      .from(shareTable)
      .update({ is_active: true })
      .eq(targetColumn, targetId)
      .eq("tenant_id", schedule.tenant_id);
    if (updateError) {
      throw updateError;
    }
  }
  const token =
    share?.share_token ?? (await createShare(admin, schedule, targetId));
  return `https://aios.co.il/shared/${isTable ? "table" : "dashboard"}/${token}`;
}

/** A new share of the target in the schedule creator's name; its token. */
async function createShare(
  admin: DbClient,
  schedule: ScheduleForShare,
  targetId: string,
): Promise<string> {
  // A share needs its creator; without one the insert would fail anyway.
  if (!schedule.created_by) {
    throw new Error("Missing schedule owner");
  }
  const row = {
    tenant_id: schedule.tenant_id,
    share_token: `report-${crypto.randomUUID().slice(0, 8)}`,
    allowed_emails: [],
    created_by: schedule.created_by,
  };
  const { data, error } =
    schedule.target_type === "table"
      ? await admin
          .from("table_shares")
          .insert({ ...row, table_id: targetId })
          .select("share_token")
          .single()
      : await admin
          .from("dashboard_shares")
          .insert({ ...row, dashboard_id: targetId })
          .select("share_token")
          .single();
  if (error) {
    throw error;
  }
  return data.share_token;
}
