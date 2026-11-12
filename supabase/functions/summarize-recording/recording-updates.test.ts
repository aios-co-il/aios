import { assertEquals } from "jsr:@std/assert@1";
import { assignmentFor } from "./recording-updates.ts";

Deno.test("a client summary assigns the recording to the client only", () => {
  assertEquals(assignmentFor("client", "c-1", null), {
    client_id: "c-1",
    lead_id: null,
    agency_id: null,
    campaigner_ids: [],
    summary_scope: "client",
  });
});

Deno.test("a team-member summary keeps the agency and the member", () => {
  assertEquals(assignmentFor("campaigner", "camp-1", "agency-1"), {
    client_id: null,
    lead_id: null,
    agency_id: "agency-1",
    campaigner_ids: ["camp-1"],
    summary_scope: "campaigner",
  });
});
