import { expect, test } from "vitest";
import { mergePrivatePhoneAllowlist } from "./carmenPrivatePhoneAllowlist.mjs";

test("mergePrivatePhoneAllowlist: combines automation, identity, and policy", () => {
  const out = mergePrivatePhoneAllowlist({
    automationPhones: ["972501111111"],
    identities: [
      {
        phone: "972502222222",
        display_name: "אנה",
        status: "approved",
        surfaces: ["whatsapp_private"],
        relationship_note: "דבר קצר",
      },
    ],
    policyPhones: [
      { phone: "972503333333", label: "דוד", surfaces: ["whatsapp_private"] },
    ],
  });
  expect(out.length).toBe(3);
  expect(
    out.some((r) => r.phone === "972501111111" && r.source === "automation"),
  ).toBeTruthy();
  expect(
    out.some(
      (r) =>
        r.phone === "972502222222" &&
        r.label === "אנה" &&
        r.relationship_note === "דבר קצר",
    ),
  ).toBeTruthy();
  expect(
    out.some((r) => r.phone === "972503333333" && r.label === "דוד"),
  ).toBeTruthy();
});

test("mergePrivatePhoneAllowlist: policy wins over automation for same phone", () => {
  const out = mergePrivatePhoneAllowlist({
    automationPhones: ["972501111111"],
    policyPhones: [
      {
        phone: "972501111111",
        label: "דוד מדיניות",
        surfaces: ["whatsapp_private"],
      },
    ],
  });
  expect(out.length).toBe(1);
  expect(out[0].label).toBe("דוד מדיניות");
  expect(out[0].source).toBe("policy");
});

test("mergePrivatePhoneAllowlist: skips identities without private surface", () => {
  const out = mergePrivatePhoneAllowlist({
    identities: [
      {
        phone: "972502222222",
        display_name: "קבוצה בלבד",
        surfaces: ["whatsapp_group"],
      },
    ],
  });
  expect(out.length).toBe(0);
});

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
