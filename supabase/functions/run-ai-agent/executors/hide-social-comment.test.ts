import { assertEquals } from "jsr:@std/assert@1";
import { executeHideSocialComment } from "./hide-social-comment.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

const managerScope = {
  isManagerRole: true,
  isTeamManager: false,
  managedAgencyIds: [],
  accessibleTenantIds: ["t1"],
};

Deno.test(
  "comment moderation requires confirmation before invocation",
  async () => {
    const fixture = executorClient([], 200, { callerScope: managerScope });
    const result = await executeHideSocialComment(
      { comment_row_id: "comment", confirmed: false },
      fixture.context,
    );
    assertEquals(result.error, "not_confirmed");
    assertEquals(fixture.calls.length, 0);
  },
);

Deno.test(
  "hide and reply retain their actions and JSON HTTP errors",
  async () => {
    for (const [name, action] of [
      ["hide_social_comment", "hide"],
      ["reply_to_social_comment", "reply"],
    ]) {
      const fixture = executorClient([{ error: "downstream" }], 400, {
        callerScope: managerScope,
        name,
      });
      const result = await executeHideSocialComment(
        { comment_row_id: "comment", confirmed: true, message: "Reply" },
        fixture.context,
      );
      assertEquals(result, { error: "downstream" });
      assertEquals(fixture.calls.length, 1);
      assertEquals(
        new URL(fixture.calls[0].url).pathname,
        "/functions/v1/social-comments",
      );
      assertEquals(fixture.calls[0].body, {
        action,
        tenant_id: "t1",
        comment_row_id: "comment",
        message: "Reply",
      });
    }
  },
);
