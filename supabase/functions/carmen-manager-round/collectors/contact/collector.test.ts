import { assertEquals } from "jsr:@std/assert@1";
import type { Json } from "../../../_shared/database.types.ts";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../../budget.ts";
import { type Call, recordingClient } from "../../tests/recording-client.ts";
import type { CollectorContext } from "../types.ts";
import { contactCollector } from "./collector.ts";

const T = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-03T10:00:00Z");
const ROW = {
  client_id: "c1",
  client_name: "לקוח א",
  agency_id: "a1",
  client_since: "2025-01-01T00:00:00Z",
  last_log_at: "2026-10-30T10:00:00Z",
  last_contact_at: "2026-11-01T10:00:00Z",
  unlogged_call_id: "call-1",
  unlogged_call_at: "2026-11-01T10:00:00Z",
  unlogged_call_seconds: 300,
  unlogged_call_resolution: "extension",
  unlogged_call_user_id: "dana",
  unlogged_call_user_name: "דנה",
  unlogged_meeting_id: null,
  unlogged_meeting_source: null,
  unlogged_meeting_at: null,
  unlogged_meeting_summary: null,
};

/** Answers the settings read and the evidence RPC like PostgREST would. */
function respond(call: Call): unknown {
  if (call.path === "tenant_heartbeat_settings") {
    return { pulse_alert_rules: { no_contact_days: 10 } };
  }
  return [ROW];
}

function context(
  db: CollectorContext["db"],
  fields: Partial<CollectorContext> = {},
): CollectorContext {
  return {
    tenantId: T,
    settings: resolveManagerSettings(null),
    now: NOW,
    since: NOW,
    watermark: null,
    budget: RoundBudget.create(60_000, 10),
    clientIds: null,
    db,
    fixtures: null,
    ...fields,
  };
}

Deno.test("contactCollector", async (t) => {
  await t.step(
    "reads the tenant's rules and evidence, and reports both kinds",
    async () => {
      const { db, calls } = recordingClient(respond);
      const result = await contactCollector.collect(context(db));
      const settings = calls.find(
        (c) => c.path === "tenant_heartbeat_settings",
      );
      assertEquals(settings?.query.get("tenant_id"), `eq.${T}`);
      const rpc = calls.find((c) =>
        c.path.endsWith("get_client_contact_evidence"),
      );
      assertEquals(rpc?.body, {
        p_tenant_id: T,
        p_since: "2026-10-24T10:00:00.000Z",
        p_min_call_seconds: 60,
      });
      assertEquals(
        result.candidates.map((c) => `${c.kind}:${c.owner_user_id}`),
        ["contact_not_logged:dana"],
      );
      assertEquals(result.coverage, { complete: true, clientIds: null });
    },
  );

  await t.step(
    "a one-client run asks for and clears only that client",
    async () => {
      const { db, calls } = recordingClient(respond);
      const result = await contactCollector.collect(
        context(db, { clientIds: ["c1"] }),
      );
      const rpc = calls.find((c) =>
        c.path.endsWith("get_client_contact_evidence"),
      );
      assertEquals(rpc?.body, {
        p_tenant_id: T,
        p_since: "2026-10-24T10:00:00.000Z",
        p_min_call_seconds: 60,
        p_client_ids: ["c1"],
      });
      assertEquals(result.coverage.clientIds, ["c1"]);
    },
  );

  await t.step("fixtures replace the evidence read in a dry run", async () => {
    const { db, calls } = recordingClient(respond);
    const fixtures: Json = {
      contact: [
        {
          ...ROW,
          last_log_at: null,
          last_contact_at: null,
          unlogged_call_id: null,
        },
      ],
    };
    const result = await contactCollector.collect(context(db, { fixtures }));
    assertEquals(
      calls.some((c) => c.path.endsWith("get_client_contact_evidence")),
      false,
    );
    assertEquals(
      result.candidates.map((c) => c.kind),
      ["no_contact"],
    );
  });
});
