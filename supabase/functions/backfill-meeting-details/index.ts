// Names old meetings and assigns their clients from their saved summaries
// (AIO-563). Defaults to dry_run=true; pass dry_run=false to write. Callers:
// the service role, or a member of the tenant.
import { applyMeetingDetailsFromSummary } from "../_shared/meeting-details/apply.ts";
import { tenantSummaryKey } from "../_shared/meeting-summary-openrouter.ts";
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import {
  isGatewayServiceRoleRequest,
  projectServiceRoleKeys,
} from "../_shared/auth/edge-caller-auth.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const MAX_LIMIT = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const params = parseParams(body);
    if (!params) {
      return json({ error: "tenant_id is required" }, 400);
    }
    const authorized = await callerMayRun(req, params.tenantId);
    if (!authorized) {
      return json({ error: "Forbidden" }, 403);
    }

    const admin = serviceClient();
    const { recordings, rowCount } = await summarizedMeetings(admin, params);
    const keys = {
      openRouterKey: await tenantSummaryKey(admin, params.tenantId),
    };
    const results = [];
    for (const rec of recordings) {
      try {
        const outcome = await applyMeetingDetailsFromSummary(admin, {
          tenantId: params.tenantId,
          recordingId: rec.id,
          summary: rec.summary_md,
          keys,
          dryRun: params.dryRun,
        });
        results.push({ id: rec.id, before: rec.meeting_topic, ...outcome });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[backfill-meeting-details] failed", rec.id, message);
        results.push({ id: rec.id, error: message });
      }
    }
    return json({
      dry_run: params.dryRun,
      processed: results.length,
      next_offset: params.offset + rowCount,
      results,
    });
  } catch (err) {
    console.error("[backfill-meeting-details] error", err);
    return json({ error: "Internal error" }, 500);
  }
});

interface BackfillParams {
  tenantId: string;
  dryRun: boolean;
  limit: number;
  offset: number;
}

interface SummarizedMeeting {
  id: string;
  meeting_topic: string | null;
  summary_md: string;
}

/** The request body's tenant, dry-run flag and page, or null without a tenant. */
function parseParams(body: Record<string, unknown>): BackfillParams | null {
  if (typeof body.tenant_id !== "string" || !body.tenant_id) {
    return null;
  }
  const limit = Number(body.limit) || 20;
  return {
    tenantId: body.tenant_id,
    dryRun: body.dry_run !== false,
    limit: Math.min(Math.max(limit, 1), MAX_LIMIT),
    offset: Math.max(Number(body.offset) || 0, 0),
  };
}

/** The service role, or a signed-in member (or super admin) of the tenant. */
async function callerMayRun(req: Request, tenantId: string): Promise<boolean> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return false;
  }
  if (
    isGatewayServiceRoleRequest(
      authorization,
      projectServiceRoleKeys((name) => Deno.env.get(name)),
    )
  ) {
    return true;
  }
  const {
    data: { user },
  } = await userClient(authorization).auth.getUser();
  if (!user) {
    return false;
  }
  const access = await tenantUserAccess(serviceClient(), tenantId, user.id);
  return access.member || access.superAdmin;
}

/** One summarized recording per meeting, newest first, for this page. */
async function summarizedMeetings(
  admin: ReturnType<typeof serviceClient>,
  params: BackfillParams,
): Promise<{ recordings: Array<SummarizedMeeting>; rowCount: number }> {
  const { data, error } = await admin
    .from("zoom_recordings")
    .select("id, meeting_id, meeting_topic, summary_md")
    .eq("tenant_id", params.tenantId)
    .not("summary_md", "is", null)
    .order("start_time", { ascending: false, nullsFirst: false })
    .range(params.offset, params.offset + params.limit - 1);
  if (error) {
    throw new Error(`recording list failed: ${error.message}`);
  }
  const rows = data ?? [];
  const seen = new Set<string>();
  const recordings: Array<SummarizedMeeting> = [];
  for (const rec of rows) {
    const key = rec.meeting_id || rec.id;
    if (seen.has(key) || !rec.summary_md) {
      continue;
    }
    seen.add(key);
    recordings.push({
      id: rec.id,
      meeting_topic: rec.meeting_topic,
      summary_md: rec.summary_md,
    });
  }
  return { recordings, rowCount: rows.length };
}

/** A JSON response with CORS headers. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
