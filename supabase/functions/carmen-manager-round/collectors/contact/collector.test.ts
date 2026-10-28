import { assertEquals } from "jsr:@std/assert@1";
import type { Json } from "../../../_shared/database.types.ts";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../../budget.ts";
import { isDeliverable } from "../../router/route.ts";
import { finding } from "../../tests/fake-world.ts";
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
  unlogged_meeting_key: null,
  unlogged_meeting_source: null,
  unlogged_meeting_at: null,
  unlogged_meeting_summary: null,
};
const EVIDENCE_BODY = {
  p_tenant_id: T,
  p_since: "2026-10-24T10:00:00.000Z",
  p_contact_since: "2026-10-14T10:00:00.000Z",
  p_min_call_seconds: 60,
};

/** Answers the evidence RPC with these rows. */
const responder = (rows: unknown[]) => (): unknown => rows;

/** A collector context for tenant T at NOW over `db`, with no_contact_days 10. */
function context(
  db: CollectorContext["db"],
  fields: Partial<CollectorContext> = {},
): CollectorContext {
  return {
    tenantId: T,
    settings: resolveManagerSettings(null),
    loadRules: () => Promise.resolve({ no_contact_days: 10 }),
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

/** The evidence RPC calls a run made. */
const evidenceCalls = (calls: Call[]) =>
  calls.filter((c) => c.path.endsWith("get_client_contact_evidence"));

Deno.test("contactCollector", async (t) => {
  await t.step(
    "reads the evidence over the tenant's no_contact_days, and reports both kinds",
    async () => {
      const { db, calls } = recordingClient(responder([ROW]));
      const result = await contactCollector.collect(context(db));
      assertEquals(evidenceCalls(calls)[0]?.body, EVIDENCE_BODY);
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
      const { db, calls } = recordingClient(responder([ROW]));
      const result = await contactCollector.collect(
        context(db, { clientIds: ["c1"] }),
      );
      assertEquals(evidenceCalls(calls)[0]?.body, {
        ...EVIDENCE_BODY,
        p_client_ids: ["c1"],
      });
      assertEquals(result.coverage.clientIds, ["c1"]);
    },
  );

  await t.step(
    "a silence after a contact older than the threshold is dated from it",
    async () => {
      // Unlogged call on 10-20 (outside p_since, inside p_contact_since), nothing logged.
      const silent = {
        ...ROW,
        last_log_at: null,
        last_contact_at: "2026-10-20T10:00:00Z",
        unlogged_call_id: null,
      };
      const { db } = recordingClient(responder([silent]));
      const [noContact] = (await contactCollector.collect(context(db)))
        .candidates;
      assertEquals(noContact.kind, "no_contact");
      assertEquals(noContact.source_event_at, "2026-10-30T10:00:00.000Z");
      const settings = resolveManagerSettings({
        manager: { mode: "team", notify_since: "2026-10-25T00:00:00Z" },
      });
      const row = finding({
        kind: "no_contact",
        source_event_at: noContact.source_event_at,
      });
      assertEquals(isDeliverable(row, "no_contact", settings, {}), true);
    },
  );

  await t.step(
    "pulse_alert_rules.no_contact_enabled off: no no_contact",
    async () => {
      const silent = { ...ROW, last_log_at: null, last_contact_at: null };
      const { db } = recordingClient(responder([silent]));
      const result = await contactCollector.collect(
        context(db, {
          loadRules: () =>
            Promise.resolve({ no_contact_days: 10, no_contact_enabled: false }),
        }),
      );
      assertEquals(
        result.candidates.map((c) => c.kind),
        ["contact_not_logged"],
      );
    },
  );

  await t.step("reads every page of a large tenant", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({
      ...ROW,
      client_id: `c${i}`,
      unlogged_call_id: null,
    }));
    const { db, calls } = recordingClient((call) =>
      call.query.get("offset") === "1000" ? [ROW] : page,
    );
    const result = await contactCollector.collect(context(db));
    assertEquals(
      evidenceCalls(calls).map((c) => c.query.get("offset") ?? "0"),
      ["0", "1000"],
    );
    assertEquals(
      result.candidates.filter((c) => c.kind === "contact_not_logged").length,
      1,
    );
  });

  await t.step("fixtures replace the evidence read in a dry run", async () => {
    const { db, calls } = recordingClient(responder([ROW]));
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
    assertEquals(evidenceCalls(calls).length, 0);
    assertEquals(
      result.candidates.map((c) => c.kind),
      ["no_contact"],
    );
  });
});
