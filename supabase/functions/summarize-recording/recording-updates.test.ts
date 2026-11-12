import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  assignmentFor,
  assignRecording,
  copyToMeetingRecordings,
} from "./recording-updates.ts";
import type { WriteSummaryInput } from "./write-summary.ts";

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

type Filter = [string, string];

interface RecordedUpdate {
  values: Record<string, unknown>;
  filters: Array<Filter>;
}

/** A zoom_recordings fake: the select finds `meetingId`, updates are recorded. */
function fakeAdmin(meetingId: string | null, updateError: string | null) {
  const updates: Array<RecordedUpdate> = [];
  const lookupFilters: Array<Filter> = [];
  const admin = {
    from: () => ({
      select: () => {
        const query = {
          eq: (column: string, value: string) => {
            lookupFilters.push([column, value]);
            return query;
          },
          maybeSingle: () =>
            Promise.resolve({
              data: meetingId ? { meeting_id: meetingId } : null,
              error: null,
            }),
        };
        return query;
      },
      update: (values: Record<string, unknown>) => {
        const update: RecordedUpdate = { values, filters: [] };
        updates.push(update);
        const query = {
          eq: (column: string, value: string) => {
            update.filters.push([column, value]);
            return query;
          },
          then: (resolve: (r: { error: { message: string } | null }) => void) =>
            resolve({
              error: updateError ? { message: updateError } : null,
            }),
        };
        return query;
      },
    }),
  } as unknown as Parameters<typeof copyToMeetingRecordings>[0];
  return { admin, updates, lookupFilters };
}

const input: WriteSummaryInput = {
  openaiKey: "",
  tenantId: "t-1",
  userId: "u-1",
  recordingId: "rec-1",
  transcript: "",
  recordingInfo: "",
  focusPrompt: "",
  targetType: "client",
  targetId: "c-1",
  targetName: "לקוח",
  targetAgencyId: null,
};

Deno.test(
  "the summary is copied to the meeting's recordings in the tenant",
  async () => {
    const { admin, updates } = fakeAdmin("meeting-9", null);
    await copyToMeetingRecordings(admin, input, "## סיכום", "file.docx");
    assertEquals(updates.length, 1);
    assertEquals(updates[0].values.summary_md, "## סיכום");
    assertEquals(updates[0].values.summary_file_url, "file.docx");
    assertEquals(updates[0].filters, [
      ["tenant_id", "t-1"],
      ["meeting_id", "meeting-9"],
    ]);
  },
);

Deno.test("a recording without a meeting copies nothing", async () => {
  const { admin, updates } = fakeAdmin(null, null);
  await copyToMeetingRecordings(admin, input, "## סיכום", "file.docx");
  assertEquals(updates.length, 0);
});

Deno.test("a failed copy rejects instead of passing as saved", async () => {
  const { admin } = fakeAdmin("meeting-9", "permission denied");
  await assertRejects(
    () => copyToMeetingRecordings(admin, input, "## סיכום", "file.docx"),
    Error,
    "permission denied",
  );
});

Deno.test(
  "a failed assignment rejects instead of passing as assigned",
  async () => {
    const { admin, updates } = fakeAdmin("meeting-9", "permission denied");
    await assertRejects(
      () => assignRecording(admin, input),
      Error,
      "permission denied",
    );
    assertEquals(updates[0].filters, [
      ["tenant_id", "t-1"],
      ["id", "rec-1"],
    ]);
  },
);
