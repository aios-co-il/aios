import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { parseTrackedEvents, type TrackedEvent } from "./tracked-events.ts";
import { resolveDashboard } from "./access.ts";
import { gaReport, readGaConnection } from "./ga-api.ts";
import { requestDates } from "./request-dates.ts";
import { pairStepsOf, pairUsers } from "./pair-funnel.ts";
import { parseTrackedRatio } from "./tracked-ratio.ts";
import { freshGaToken } from "./ga-token.ts";
import { funnelRequest, usersRequest } from "./ga-requests.ts";
import {
  buildEventUsers,
  funnelStepUsers,
  usersByEvent,
  usersBySource,
} from "./reports.ts";

/**
 * People per followed site event, by source and in total, with each step's
 * conversion from the one before, for a dashboard's GA property and dates.
 * Callers: the internal dashboard (signed in, by dashboard id) and its share
 * link (by share token).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const db = serviceClient();
    const access = await resolveDashboard(body, {
      shared: (token) =>
        db
          .from("dashboard_shares")
          .select("crm_dashboards(id, tenant_id, client_id, settings)")
          .eq("share_token", token)
          .eq("is_active", true)
          .maybeSingle(),
      caller: (id) =>
        userClient(req.headers.get("Authorization") ?? "")
          .from("crm_dashboards")
          .select("id, tenant_id, client_id, settings")
          .eq("id", id)
          .maybeSingle(),
    });
    if (!access.ok) {
      return json({ error: access.error }, access.status);
    }
    const { tenant_id, client_id, settings } = access.dashboard;
    const steps = parseTrackedEvents(settings);
    if (steps.length === 0 || !client_id) {
      return json({ error: "No events" }, 404);
    }
    const dates = requestDates(body);
    if (!dates) {
      return json(emptyEventUsers(steps), 200);
    }
    const { startDate, endDate } = dates;
    const ga = await readGaConnection(db, { tenant_id, client_id });
    if (!ga) {
      return json({ error: "No Google Analytics" }, 404);
    }
    const token = await freshGaToken(db, ga.integration);
    const run = (method: string, request: unknown) =>
      gaReport(token, ga.propertyId, method, request);
    const pairSteps = pairStepsOf(steps, parseTrackedRatio(settings, steps));
    const [total, bySource, funnelTotal, funnelBySource, pair] =
      await Promise.all([
        run("v1beta:runReport", usersRequest(steps, startDate, endDate, false)),
        run("v1beta:runReport", usersRequest(steps, startDate, endDate, true)),
        run(
          "v1alpha:runFunnelReport",
          funnelRequest(steps, startDate, endDate, false),
        ),
        run(
          "v1alpha:runFunnelReport",
          funnelRequest(steps, startDate, endDate, true),
        ),
        pairSteps
          ? run(
              "v1alpha:runFunnelReport",
              funnelRequest(pairSteps, startDate, endDate, false),
            )
          : null,
      ]);
    if (!total.ok || !bySource.ok) {
      return json({ error: "Google Analytics report failed" }, 502);
    }
    return json(
      {
        ...buildEventUsers({
          steps,
          totalUsers: usersByEvent(total.rows),
          sourceUsers: usersBySource(bySource.rows),
          totalFunnel: funnelTotal.ok
            ? funnelStepUsers(funnelTotal.rows, steps, false)
            : null,
          sourceFunnel: funnelBySource.ok
            ? funnelStepUsers(funnelBySource.rows, steps, true)
            : null,
        }),
        pair: pairSteps && pair?.ok ? pairUsers(pair.rows, pairSteps) : null,
      },
      200,
    );
  } catch (error) {
    console.error("[ga-event-users] failed:", error);
    return json({ error: "Failed to read Google Analytics" }, 500);
  }
});

/** The table for an empty period: no people and no rates, without asking GA. */
function emptyEventUsers(steps: Array<TrackedEvent>) {
  return buildEventUsers({
    steps,
    totalUsers: {},
    sourceUsers: new Map(),
    totalFunnel: new Map(),
    sourceFunnel: new Map(),
  });
}

/** A JSON response with CORS headers. */
function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
