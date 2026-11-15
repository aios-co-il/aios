import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  type ClientOption,
  type MeetingDetailsPolicy,
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

/** The automatic pipeline found no client, so the summary may assign one. */
const AUTO: MeetingDetailsPolicy = { assignClient: true, renameMeeting: true };

describe("planMeetingDetailsUpdate", () => {
  it("replaces a generic name and gives an unassigned meeting its client", () => {
    const plan = planMeetingDetailsUpdate(
      UNASSIGNED,
      { title: "בילבי — תוכנית קמפיין לנובמבר", clientId: "c-bilbi" },
      CLIENTS,
      AUTO,
    );
    assertEquals(plan.topic, "בילבי — תוכנית קמפיין לנובמבר");
    assertEquals(plan.client, {
      client_id: "c-bilbi",
      agency_id: "agency-1",
      summary_scope: "client",
      suggested_client_id: null,
    });
  });

  it("never replaces a name a person typed", () => {
    const plan = planMeetingDetailsUpdate(
      { ...UNASSIGNED, meeting_topic: "השם שלי", topic_set_manually: true },
      { title: "שם מהסיכום", clientId: null },
      CLIENTS,
      AUTO,
    );
    assertEquals(plan.topic, null);
  });

  it("keeps an assigned recording's client, lead or team members", () => {
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
        AUTO,
      );
      assertEquals(plan.client, null);
    }
  });

  it("only names a meeting whose target a person chose, agency included", () => {
    const plan = planMeetingDetailsUpdate(
      UNASSIGNED,
      { title: "בילבי — תוכנית קמפיין", clientId: "c-bilbi" },
      CLIENTS,
      { assignClient: false, renameMeeting: true },
    );
    assertEquals(plan.client, null);
    assertEquals(plan.topic, "בילבי — תוכנית קמפיין");
  });

  it("keeps the name but still assigns the client when renameMeeting is false", () => {
    const plan = planMeetingDetailsUpdate(
      { ...UNASSIGNED, meeting_topic: "פגישה שבועית אקו" },
      { title: "אקו — סטטוס קמפיינים", clientId: "c-bilbi" },
      CLIENTS,
      { assignClient: true, renameMeeting: false },
    );
    assertEquals(plan.topic, null);
    assertEquals(plan.client?.client_id, "c-bilbi");
  });
});

describe("parseMeetingDetails", () => {
  it("drops a client id the model made up", () => {
    assertEquals(
      parseMeetingDetails({ title: " פגישה ", client_id: "made-up" }, CLIENTS),
      { title: "פגישה", clientId: null },
    );
    assertEquals(parseMeetingDetails("not json", CLIENTS), {
      title: null,
      clientId: null,
    });
  });
});
