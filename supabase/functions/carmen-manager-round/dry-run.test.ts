import { assertEquals } from "jsr:@std/assert@1";
import { previewMessages, virtualFindings } from "./dry-run.ts";
import { finding } from "./tests/fake-world.ts";

Deno.test("dry-run preview", async (t) => {
  const candidate = {
    kind: "client_complaint" as const,
    fingerprint: "chat:1",
    severity: "critical" as const,
    client_id: "c1",
    agency_id: null,
    source_event_at: "2026-11-01T07:00:00Z",
    summary_he: "לקוח א מתלונן",
    evidence: {},
    owner_user_id: null,
  };

  await t.step("candidates become unrouted, unstored findings", () => {
    const [row] = virtualFindings([candidate]);
    assertEquals(
      [row.id, row.short_code, row.status, row.escalation_level, row.severity],
      ["dry-run:0", 0, "open", null, "critical"],
    );
  });

  await t.step("one message per recipient over all planned deliveries", () => {
    const a = finding({ short_code: 1, summary_he: "א" });
    const b = finding({ short_code: 2, summary_he: "ב" });
    const plan = (
      finding_id: string,
      recipient_key: string,
      recipient_name: string,
      status: "planned" | "no_phone" = "planned",
    ) => ({
      finding_id,
      status: "notified" as const,
      escalation_level: 0,
      ladder_started_at: null,
      next_action_at: null,
      owner_user_id: null,
      planned_actions: null,
      deliveries: [
        {
          level: 0 as const,
          recipient_key,
          recipient_user_id: null,
          recipient_name,
          recipient_phone: null,
          channel: "manus_wa" as const,
          slot: "now" as const,
          status,
          not_before: "2026-11-01T08:00:00Z",
        },
      ],
    });
    const messages = previewMessages(
      [
        plan(a.id, "user:d", "דנה"),
        plan(b.id, "user:d", "דנה"),
        plan(b.id, "user:x", "יוסי", "no_phone"),
      ],
      [a, b],
    );
    assertEquals(
      messages.map((m) => [m.to, m.has_phone, m.text]),
      [
        ["דנה", true, "היי דנה, יש 2 דברים שדורשים טיפול:\n1) #1 א\n2) #2 ב"],
        ["יוסי", false, "היי יוסי, יש דבר אחד שדורש טיפול:\n1) #2 ב"],
      ],
    );
  });
});
