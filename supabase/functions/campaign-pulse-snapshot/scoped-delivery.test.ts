import { assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import type { PulseDeliveryPlan } from "../_shared/pulse-delivery.ts";
import { deliverReportDigest } from "./report-digest.ts";
import { deliverScopedPulseRecipients } from "./scoped-delivery.ts";

const FELIX = "972500000011";
const DANA = "972500000022";
const RINA = "972500000033";
const PREVIEW = "972500000099";

/** Felix and Dana are on the report list; Rina is not. */
const REPORT_LIST = [
  { name: "Felix", phone: FELIX, source: "configured" as const },
  { name: "Dana", phone: DANA, source: "configured" as const },
];

const SNAPSHOTS = [
  { client_id: "c-1", client_name: "Client 1", status: "healthy" },
  { client_id: "c-2", client_name: "Client 2", status: "warning" },
];

function plan(name: string, phone: string): PulseDeliveryPlan {
  return {
    key: `campaigner:${name}`,
    role: "campaigner",
    name,
    phone,
    clientIds: ["c-1"],
  };
}

const PLANS = [plan("Felix", FELIX), plan("Dana", DANA), plan("Rina", RINA)];

/**
 * One pulse run as campaign-pulse-snapshot wires it: the full digest to the
 * report list, then the scoped step with that step's result.
 */
async function pulseRun(run: {
  previewOnly?: boolean;
  campaignerName?: string;
  plans?: PulseDeliveryPlan[];
  failPhone?: string;
}) {
  const sends: Array<{ message: string; phone: string }> = [];
  const queue = async (message: string, phone: string) => {
    sends.push({ message, phone });
    return phone !== run.failPhone;
  };
  const previewOnly = run.previewOnly ?? false;
  const reportDigest = await deliverReportDigest({
    tenantId: "t-1",
    recipients: REPORT_LIST,
    digest: "full digest",
    queue,
    previewOnly,
    campaignerName: run.campaignerName ?? null,
  });
  const scoped = await deliverScopedPulseRecipients({
    plans: run.plans ?? PLANS,
    snapshots: SNAPSHOTS,
    dashboardUrl: "https://example.test/pulse",
    tenantSlug: "org",
    previewPhone: PREVIEW,
    previewOnly,
    reportDigest,
    queue,
  });
  return { sends, scoped };
}

/** Who got what: "digest", "preview:<name>" or "scoped". */
function sent(sends: Array<{ message: string; phone: string }>) {
  return sends.map(({ message, phone }) => {
    if (message === "full digest") {
      return [phone, "digest"];
    }
    const preview = message.match(/תצוגה מקדימה — בדיקת דופק ל(\S+)\*/);
    return [phone, preview ? `preview:${preview[1]}` : "scoped"];
  });
}

Deno.test(
  "a pulse run through the report digest and the scoped step",
  async (t) => {
    await t.step(
      "people on the report list get only the full digest",
      async () => {
        const { sends } = await pulseRun({});

        assertEquals(sent(sends), [
          [FELIX, "digest"],
          [DANA, "digest"],
          [PREVIEW, "preview:Rina"],
          [RINA, "scoped"],
        ]);
      },
    );

    await t.step(
      "a listed person whose digest failed still gets their own",
      async () => {
        const { sends } = await pulseRun({ failPhone: FELIX });

        assertEquals(sent(sends), [
          [FELIX, "digest"],
          [DANA, "digest"],
          [PREVIEW, "preview:Felix"],
          [FELIX, "scoped"],
          [PREVIEW, "preview:Rina"],
          [RINA, "scoped"],
        ]);
      },
    );

    await t.step(
      "a run for Dana, who is on the list, sends Dana her own digest",
      async () => {
        const { sends, scoped } = await pulseRun({
          campaignerName: "Dana",
          plans: [plan("Dana", DANA)],
        });

        assertEquals(sent(sends), [
          [PREVIEW, "preview:Dana"],
          [DANA, "scoped"],
        ]);
        assertEquals(
          scoped.map((row) => [row.type, row.recipient, row.queued]),
          [
            ["preview", "Dana", true],
            ["campaigner", "Dana", true],
          ],
        );
      },
    );

    await t.step(
      "a preview shows only the sends the real run makes",
      async () => {
        const { sends } = await pulseRun({ previewOnly: true });

        assertEquals(sent(sends), [[PREVIEW, "preview:Rina"]]);
      },
    );

    await t.step(
      "the scoped digest covers only the plan's clients",
      async () => {
        const { sends } = await pulseRun({});

        const rina = sends.find((send) => send.phone === RINA);
        assertMatch(rina?.message ?? "", /בדיקת דופק — Client 1/);
        assertNotMatch(rina?.message ?? "", /Client 2/);
      },
    );
  },
);
