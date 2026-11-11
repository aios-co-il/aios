import { assertEquals } from "jsr:@std/assert@1";
import {
  type ClientOption,
  parseMeetingDetails,
  planMeetingDetailsUpdate,
  type RecordingAssignment,
} from "./plan.ts";

const CLIENTS: Array<ClientOption> = [
  { id: "c-bilbi", name: "בילבי", agency_id: "agency-1" },
  { id: "c-other", name: "לקוח אחר", agency_id: "agency-2" },
];

const UNASSIGNED: RecordingAssignment = {
  meeting_topic: "Zoom — כרמן",
  topic_set_manually: false,
  client_id: null,
  lead_id: null,
  campaigner_ids: [],
  summary_scope: "agency",
};

Deno.test(
  "a generic name is replaced and an unassigned meeting gets its client",
  () => {
    const plan = planMeetingDetailsUpdate(
      UNASSIGNED,
      { title: "בילבי — תוכנית קמפיין לנובמבר", clientId: "c-bilbi" },
      CLIENTS,
    );
    assertEquals(plan.topic, "בילבי — תוכנית קמפיין לנובמבר");
    assertEquals(plan.client, {
      client_id: "c-bilbi",
      agency_id: "agency-1",
      summary_scope: "client",
      suggested_client_id: null,
    });
  },
);

Deno.test("a name a person typed is never replaced", () => {
  const plan = planMeetingDetailsUpdate(
    { ...UNASSIGNED, meeting_topic: "השם שלי", topic_set_manually: true },
    { title: "שם מהסיכום", clientId: null },
    CLIENTS,
  );
  assertEquals(plan.topic, null);
});

Deno.test(
  "an assigned recording keeps its client, lead or team members",
  () => {
    const details = { title: null, clientId: "c-bilbi" };
    for (const assigned of [
      { client_id: "c-other" },
      { lead_id: "lead-1" },
      { campaigner_ids: ["camp-1"], summary_scope: "campaigner" },
    ]) {
      const plan = planMeetingDetailsUpdate(
        { ...UNASSIGNED, ...assigned },
        details,
        CLIENTS,
      );
      assertEquals(plan.client, null);
    }
  },
);

Deno.test("a client id the model made up is dropped", () => {
  assertEquals(
    parseMeetingDetails({ title: " פגישה ", client_id: "made-up" }, CLIENTS),
    { title: "פגישה", clientId: null },
  );
  assertEquals(parseMeetingDetails("not json", CLIENTS), {
    title: null,
    clientId: null,
  });
});
