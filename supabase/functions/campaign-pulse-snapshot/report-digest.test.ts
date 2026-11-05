import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  deliverMissingPhoneAlert,
  deliverReportDigest,
} from "./report-digest.ts";

const RECIPIENTS = [
  { name: "Felix", phone: "972500000011", source: "configured" as const },
  { name: "David", phone: "972500000012", source: "configured" as const },
];

function recordingQueue(failPhone?: string) {
  const sends: Array<{ message: string; phone: string }> = [];
  const queue = async (message: string, phone: string) => {
    sends.push({ message, phone });
    return phone !== failPhone;
  };
  return { sends, queue };
}

/** A real Sunday run: no preview, no campaigner filter. */
const FULL_RUN = { tenantId: "t-1", previewOnly: false, campaignerName: null };

Deno.test("deliverReportDigest", async (t) => {
  await t.step("sends the full digest to every report recipient", async () => {
    const { sends, queue } = recordingQueue();

    const result = await deliverReportDigest({
      ...FULL_RUN,
      recipients: RECIPIENTS,
      digest: "full digest",
      queue,
    });

    assertEquals(sends, [
      { message: "full digest", phone: "972500000011" },
      { message: "full digest", phone: "972500000012" },
    ]);
    assertStrictEquals(result.sent, true);
    assertEquals(
      result.entries.map((row) => [row.type, row.recipient, row.queued]),
      [
        ["report_digest", "Felix", true],
        ["report_digest", "David", true],
      ],
    );
  });

  await t.step("counts as sent when one recipient was queued", async () => {
    const { queue } = recordingQueue("972500000011");

    const result = await deliverReportDigest({
      ...FULL_RUN,
      recipients: RECIPIENTS,
      digest: "full digest",
      queue,
    });

    assertStrictEquals(result.sent, true);
  });

  await t.step("no recipients sends nothing and reports not sent", async () => {
    const { sends, queue } = recordingQueue();

    const result = await deliverReportDigest({
      ...FULL_RUN,
      recipients: [],
      digest: "full digest",
      queue,
    });

    assertEquals(sends, []);
    assertEquals(result, {
      sent: false,
      entries: [],
      getsDigest: new Set<string>(),
    });
  });

  await t.step(
    "getsDigest holds only the phones the digest was queued to",
    async () => {
      const { queue } = recordingQueue("972500000011");

      const result = await deliverReportDigest({
        ...FULL_RUN,
        recipients: RECIPIENTS,
        digest: "full digest",
        queue,
      });

      assertEquals(result.getsDigest, new Set(["972500000012"]));
    },
  );

  await t.step(
    "a preview sends nothing and skips everyone the real run sends the digest to",
    async () => {
      const { sends, queue } = recordingQueue();

      const result = await deliverReportDigest({
        ...FULL_RUN,
        previewOnly: true,
        recipients: RECIPIENTS,
        digest: "full digest",
        queue,
      });

      assertEquals(sends, []);
      assertEquals(result, {
        sent: false,
        entries: [],
        getsDigest: new Set(["972500000011", "972500000012"]),
      });
    },
  );

  await t.step(
    "a run for one campaigner sends no digest and skips nobody",
    async () => {
      const { sends, queue } = recordingQueue();

      for (const previewOnly of [false, true]) {
        const result = await deliverReportDigest({
          ...FULL_RUN,
          previewOnly,
          campaignerName: "Felix",
          recipients: RECIPIENTS,
          digest: "full digest",
          queue,
        });

        assertEquals(result, {
          sent: false,
          entries: [],
          getsDigest: new Set<string>(),
        });
      }
      assertEquals(sends, []);
    },
  );
});

Deno.test("deliverMissingPhoneAlert", async (t) => {
  const campaigners = [
    { campaignerId: "c-1", name: "Campaigner", clientCount: 3 },
  ];

  await t.step("asks every report recipient to add the phone", async () => {
    const { sends, queue } = recordingQueue();

    const result = await deliverMissingPhoneAlert({
      recipients: RECIPIENTS,
      campaigners,
      tenantLabel: "org",
      queue,
    });

    assertEquals(
      sends.map((send) => send.phone),
      ["972500000011", "972500000012"],
    );
    assertMatch(sends[0].message, /Campaigner \(3/);
    assertEquals(result?.entry.campaigners, ["Campaigner"]);
    assertStrictEquals(result?.sent, true);
  });

  await t.step(
    "nothing to send without campaigners or recipients",
    async () => {
      const { sends, queue } = recordingQueue();

      assertStrictEquals(
        await deliverMissingPhoneAlert({
          recipients: RECIPIENTS,
          campaigners: [],
          tenantLabel: "org",
          queue,
        }),
        null,
      );
      assertStrictEquals(
        await deliverMissingPhoneAlert({
          recipients: [],
          campaigners,
          tenantLabel: "org",
          queue,
        }),
        null,
      );
      assertEquals(sends, []);
    },
  );
});
