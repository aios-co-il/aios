import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { FindingResolution } from "../collectors/types.ts";
import { recordingClient } from "../tests/recording-client.ts";
import { resolveFindings } from "./resolve.ts";

const T = "11111111-1111-4111-8111-111111111111";
const item: FindingResolution = {
  kind: "unanswered_request",
  fingerprint: "chat:group:1@g.us:m1",
  resolution: "answered",
  details: { response_minutes: 42 },
};

Deno.test("resolveFindings", async (t) => {
  await t.step(
    "closes the collector's findings in the tenant, nothing when there are none",
    async () => {
      const { db, calls } = recordingClient(() => [
        { finding_id: "f1", short_code: 1 },
      ]);
      const resolve = resolveFindings(db);
      assertEquals(await resolve(T, "r1", "chat_sla", []), 0);
      assertEquals(await resolve(T, "r1", "chat_sla", [item]), 1);
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
    await assertRejects(
      () => resolveFindings(db)(T, "r1", "chat_sla", [item]),
      Error,
      "carmen_finding_resolve",
    );
  });
});
