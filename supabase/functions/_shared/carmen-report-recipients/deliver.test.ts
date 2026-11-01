import { assertEquals } from "jsr:@std/assert@1";
import { queueToReportRecipients } from "./deliver.ts";

const RECIPIENTS = [
  { name: "Felix", phone: "972500000011", source: "configured" as const },
  { name: "David", phone: "972500000012", source: "configured" as const },
];

Deno.test("queueToReportRecipients", async (t) => {
  await t.step(
    "queues the same message to each recipient in order",
    async () => {
      const sends: Array<[string, string]> = [];

      const deliveries = await queueToReportRecipients(
        RECIPIENTS,
        "digest",
        async (message, phone) => (sends.push([message, phone]), true),
      );

      assertEquals(sends, [
        ["digest", "972500000011"],
        ["digest", "972500000012"],
      ]);
      assertEquals(deliveries, [
        {
          recipient: "Felix",
          phone: "972500000011",
          source: "configured",
          queued: true,
        },
        {
          recipient: "David",
          phone: "972500000012",
          source: "configured",
          queued: true,
        },
      ]);
    },
  );

  await t.step("records a failed queue per recipient", async () => {
    const deliveries = await queueToReportRecipients(
      RECIPIENTS,
      "digest",
      async (_message, phone) => phone === "972500000012",
    );

    assertEquals(
      deliveries.map((row) => row.queued),
      [false, true],
    );
  });

  await t.step("no recipients queues nothing", async () => {
    assertEquals(
      await queueToReportRecipients([], "digest", async () => true),
      [],
    );
  });
});
