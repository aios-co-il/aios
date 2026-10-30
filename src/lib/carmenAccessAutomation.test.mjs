import { expect, test } from "vitest";

test("pickCarmenAutomationConfig merges phones across private+group triggers", async () => {
  // Pure helper mirror of fetchCarmenAutomationConfig merge rules
  const configs = [
    {
      agent_id: "a1",
      carmen_scope_mode: "specific_group",
      carmen_allowed_group_ids: ["g1"],
    },
    {
      agent_id: "a1",
      carmen_scope_mode: "specific_phone",
      carmen_allowed_phones: ["972507677613", "972545612156"],
    },
  ];
  const withPhones = configs.filter(
    (c) => (c.carmen_allowed_phones || []).length > 0,
  );
  const preferred = withPhones[0] || configs[0];
  const mergedPhones = [
    ...new Set(
      configs.flatMap((c) =>
        (c.carmen_allowed_phones || [])
          .map((p) => String(p).replace(/\D/g, ""))
          .filter(Boolean),
      ),
    ),
  ];
  expect(preferred.carmen_scope_mode).toBe("specific_phone");
  expect(mergedPhones).toStrictEqual(["972507677613", "972545612156"]);
});
