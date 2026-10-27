import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { FindingResolution } from "../collectors/types.ts";
import { recordingClient } from "../tests/recording-client.ts";
import { createFindingsStore } from "./store.ts";

const T = "11111111-1111-4111-8111-111111111111";
const candidate = {
  kind: "no_contact" as const,
  fingerprint: "client:c1",
  severity: "warning" as const,
  client_id: "c1",
  agency_id: null,
  source_event_at: "2026-11-01T07:00:00Z",
  summary_he: "לקוח א",
  evidence: {},
  owner_user_id: null,
};

Deno.test(
  "createFindingsStore keeps every call inside the tenant",
  async (t) => {
    await t.step(
      "upsert raises on an outcome the round does not know",
      async () => {
        const { db } = recordingClient(() => [
          {
            finding_id: null,
            kind: "no_contact",
            fingerprint: "client:c1",
            short_code: null,
            outcome: "skipped_somehow",
          },
        ]);
        await assertRejects(
          () =>
            createFindingsStore(db).upsert(
              T,
              "r1",
              { id: "contact", detectorVersion: "2" },
              [candidate],
            ),
          Error,
          "unknown outcome skipped_somehow",
        );
      },
    );

    await t.step(
      "upsert sends the candidates to the RPC, and nothing when there are none",
      async () => {
        const { db, calls } = recordingClient(() => [
          {
            finding_id: "f1",
            kind: "no_contact",
            fingerprint: "client:c1",
            short_code: 1,
            outcome: "inserted",
          },
        ]);
        const store = createFindingsStore(db);
        assertEquals(
          await store.upsert(
            T,
            "r1",
            { id: "contact", detectorVersion: "2" },
            [],
          ),
          [],
        );
        const outcomes = await store.upsert(
          T,
          "r1",
          { id: "contact", detectorVersion: "2" },
          [candidate],
        );
        assertEquals(outcomes[0].outcome, "inserted");
        assertEquals(
          calls.map((c) => [c.path, c.body]),
          [
            [
              "rpc/carmen_finding_upsert",
              {
                p_tenant_id: T,
                p_round_id: "r1",
                p_collector: "contact",
                p_detector_version: "2",
                p_candidates: [candidate],
              },
            ],
          ],
        );
      },
    );

    await t.step(
      "listRoutable reads only the tenant's live, due findings",
      async () => {
        const { db, calls } = recordingClient();
        await createFindingsStore(db).listRoutable(
          T,
          new Date("2026-11-01T08:00:00Z"),
          50,
        );
        const query = calls[0].query;
        assertEquals(
          [
            calls[0].path,
            query.get("tenant_id"),
            query.get("status"),
            query.get("limit"),
          ],
          ["carmen_findings", `eq.${T}`, "in.(open,notified,snoozed)", "50"],
        );
        assertEquals(
          query.get("or"),
          "(routed_at.is.null,next_action_at.lte.2026-11-01T08:00:00.000Z)",
        );
      },
    );

    await t.step(
      "markMissing omits an absent scope; byIds stays in the tenant",
      async () => {
        const { db, calls } = recordingClient(() => [
          { finding_id: "f1", short_code: 1 },
        ]);
        const store = createFindingsStore(db);
        const cleared = await store.markMissing(T, "r1", {
          kind: "no_contact",
          seen: [],
          clientIds: null,
          fingerprints: ["a"],
          afterMisses: 1,
        });
        assertEquals(cleared, 1);
        assertEquals(calls[0].body, {
          p_tenant_id: T,
          p_kind: "no_contact",
          p_seen: [],
          p_fingerprints: ["a"],
          p_after_misses: 1,
          p_round_id: "r1",
        });
        await store.byIds(T, ["f1"]);
        assertEquals(calls[1].query.get("tenant_id"), `eq.${T}`);
      },
    );

    await t.step(
      "resolve closes the collector's findings in the tenant, nothing when there are none",
      async () => {
        const { db, calls } = recordingClient(() => [
          { finding_id: "f1", short_code: 1 },
        ]);
        const store = createFindingsStore(db);
        const item: FindingResolution = {
          kind: "unanswered_request",
          fingerprint: "chat:group:1@g.us:m1",
          resolution: "answered",
          details: { response_minutes: 42 },
        };
        assertEquals(await store.resolve(T, "r1", "chat_sla", []), 0);
        assertEquals(await store.resolve(T, "r1", "chat_sla", [item]), 1);
        assertEquals(
          calls.map((c) => [c.path, c.body]),
          [
            [
              "rpc/carmen_finding_resolve",
              {
                p_tenant_id: T,
                p_round_id: "r1",
                p_collector: "chat_sla",
                p_items: [item],
              },
            ],
          ],
        );
      },
    );

    await t.step("a database error is raised with its step", async () => {
      const { db } = recordingClient(() => ({ message: "boom" }), {
        status: 400,
      });
      const decision = {
        finding_id: "f",
        status: null,
        escalation_level: null,
        ladder_started_at: null,
        next_action_at: null,
        owner_user_id: null,
        planned_actions: null,
        deliveries: [],
      };
      await assertRejects(
        () => createFindingsStore(db).applyRoute(T, "r1", [decision]),
        Error,
        "carmen_finding_apply_route: boom",
      );
    });
  },
);
