import { assertEquals } from "jsr:@std/assert@1";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@1/bdd";

import {
  type BackgroundDeps,
  writeSummaryInBackground,
  type WriteSummaryInput,
  type WrittenSummary,
} from "./write-summary.ts";

const INPUT: WriteSummaryInput = {
  openaiKey: "key",
  tenantId: "tenant-1",
  userId: "user-1",
  recordingId: "rec-1",
  transcript: "תמלול",
  recordingInfo: "",
  focusPrompt: "",
  targetType: "client",
  targetId: "client-1",
  targetName: "לקוח",
  targetAgencyId: null,
};

const WRITTEN: WrittenSummary = {
  summary: "## תקציר",
  fileUrl: "https://files.test/summary.docx",
  fileName: "summary.docx",
  marketingBriefCreated: false,
  marketingWorkItemId: null,
};

interface RecordedUpdate {
  values: Record<string, unknown>;
  filters: Array<[string, string]>;
}

/** A zoom_recordings fake that records each update and its filters. */
function fakeAdmin(updateError: string | null = null) {
  const updates: Array<RecordedUpdate> = [];
  const admin = {
    from: (table: string) => {
      assertEquals(table, "zoom_recordings");
      return {
        update: (values: Record<string, unknown>) => {
          const update: RecordedUpdate = { values, filters: [] };
          updates.push(update);
          const query = {
            eq: (column: string, value: string) => {
              update.filters.push([column, value]);
              return query;
            },
            then: (
              resolve: (result: { error: { message: string } | null }) => void,
            ) =>
              resolve({
                error: updateError ? { message: updateError } : null,
              }),
          };
          return query;
        },
      };
    },
  };
  return {
    admin: admin as unknown as ReturnType<BackgroundDeps["admin"]>,
    updates,
  };
}

function deps(
  write: BackgroundDeps["write"],
  admin: ReturnType<BackgroundDeps["admin"]>,
  handed: Array<Promise<unknown>>,
): BackgroundDeps {
  return {
    write,
    admin: () => admin,
    waitUntil: (work) => handed.push(work),
  };
}

describe("writeSummaryInBackground", () => {
  const realError = console.error;
  const realLog = console.log;
  let errors: Array<string> = [];
  let logs: Array<string> = [];

  beforeEach(() => {
    errors = [];
    logs = [];
    console.error = (...args: Array<unknown>) => errors.push(args.join(" "));
    console.log = (...args: Array<unknown>) => logs.push(args.join(" "));
  });

  afterEach(() => {
    console.error = realError;
    console.log = realLog;
  });

  it("hands the work to waitUntil and logs a saved summary", async () => {
    const { admin, updates } = fakeAdmin();
    const handed: Array<Promise<unknown>> = [];

    const work = writeSummaryInBackground(
      INPUT,
      deps(() => Promise.resolve(WRITTEN), admin, handed),
    );
    await work;

    assertEquals(handed, [work]);
    assertEquals(updates, []);
    assertEquals(
      logs.some((line) => line.includes("summary saved rec-1")),
      true,
    );
  });

  it("records a failed summary on the recording within its tenant", async () => {
    const { admin, updates } = fakeAdmin();
    const handed: Array<Promise<unknown>> = [];

    await writeSummaryInBackground(
      INPUT,
      deps(() => Promise.reject(new Error("model timed out")), admin, handed),
    );

    assertEquals(updates.length, 1);
    assertEquals(updates[0].values.summary_error, "model timed out");
    assertEquals(typeof updates[0].values.summary_failed_at, "string");
    assertEquals(updates[0].filters, [
      ["id", "rec-1"],
      ["tenant_id", "tenant-1"],
    ]);
    assertEquals(
      errors.some((line) => line.includes("background summary failed rec-1")),
      true,
    );
  });

  it("logs, and does not reject, when the failure mark cannot be saved", async () => {
    const { admin } = fakeAdmin("db down");

    await writeSummaryInBackground(
      INPUT,
      deps(() => Promise.reject(new Error("model timed out")), admin, []),
    );

    assertEquals(
      errors.some((line) =>
        line.includes("could not record the summary failure rec-1 db down"),
      ),
      true,
    );
  });
});
