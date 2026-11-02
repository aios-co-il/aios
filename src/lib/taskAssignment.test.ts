import { expect, test } from "vitest";
import { describeTaskAssignment } from "./taskAssignment.ts";

test("describes assignee, client, and who gave the task", () => {
  const labels = describeTaskAssignment({
    campaigners: { full_name: "נועה" },
    clients: { name: "דלתא" },
    creator_name: "דוד",
  });
  expect(labels.assignedTo).toBe("נועה");
  expect(labels.client).toBe("דלתא");
  expect(labels.givenBy).toBe("דוד");
});

test("uses the page client name when the task row has no nested client", () => {
  const labels = describeTaskAssignment(
    { campaigners: { full_name: "נועה" }, creator_name: "אנה" },
    "מרקטינג קפטן",
  );
  expect(labels.client).toBe("מרקטינג קפטן");
  expect(labels.assignedTo).toBe("נועה");
  expect(labels.givenBy).toBe("אנה");
});
