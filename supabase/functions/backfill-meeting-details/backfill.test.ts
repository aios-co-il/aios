import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import type { MeetingDetailsOutcome } from "../_shared/meeting-details/apply.ts";
import type { MeetingDetailsPolicy } from "../_shared/meeting-details/plan.ts";
import { backfillMeetings, type SummarizedMeeting } from "./backfill.ts";

const OUTCOME: MeetingDetailsOutcome = {
  title: "בילבי — סטטוס קמפיינים",
  clientId: null,
  topicUpdated: false,
  clientAssigned: false,
};

/** A fake apply step that records the policy each meeting was given. */
function recordingApply(failIds: Array<string> = []) {
  const policies = new Map<string, MeetingDetailsPolicy>();
  /** Fails for `failIds`, otherwise reports a rename when the policy allows one. */
  function apply(
    meeting: SummarizedMeeting,
    policy: MeetingDetailsPolicy,
  ): Promise<MeetingDetailsOutcome> {
    policies.set(meeting.id, policy);
    if (failIds.includes(meeting.id)) {
      return Promise.reject(new Error("model unavailable"));
    }
    return Promise.resolve({ ...OUTCOME, topicUpdated: policy.renameMeeting });
  }
  return { apply, policies };
}

/** A summarized meeting with the given name. */
function meeting(id: string, topic: string | null): SummarizedMeeting {
  return { id, meeting_topic: topic, summary_md: "## סיכום" };
}

describe("backfillMeetings", () => {
  it("keeps a human name and renames a default one", async () => {
    const { apply, policies } = recordingApply();
    const report = await backfillMeetings(
      [
        meeting("human", "פגישה שבועית אקו"),
        meeting("bot", "Zoom — כרמן"),
        meeting("extension", "הקלטת פגישה 13.11.2026"),
      ],
      apply,
    );

    assertEquals(policies.get("human"), {
      assignClient: true,
      renameMeeting: false,
    });
    assertEquals(policies.get("bot"), {
      assignClient: true,
      renameMeeting: true,
    });
    assertEquals(policies.get("extension")?.renameMeeting, true);
    assertEquals(report.kept, 1);
    assertEquals(
      report.results.map((result) => [result.id, result.kept]),
      [
        ["human", true],
        ["bot", false],
        ["extension", false],
      ],
    );
  });

  it("reports a failed meeting with its kept flag and runs the rest", async () => {
    const { apply } = recordingApply(["human"]);
    const report = await backfillMeetings(
      [meeting("human", "אנה ודוד"), meeting("manual", "הקלטה ידנית")],
      apply,
    );

    assertEquals(report.results[0], {
      id: "human",
      before: "אנה ודוד",
      kept: true,
      error: "model unavailable",
    });
    assertEquals(report.results[1], {
      id: "manual",
      before: "הקלטה ידנית",
      kept: false,
      ...OUTCOME,
      topicUpdated: true,
    });
    assertEquals(report.kept, 1);
  });
});
