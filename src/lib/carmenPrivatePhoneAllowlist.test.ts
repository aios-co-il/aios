import { expect, test } from "vitest";
import {
  decodePrivatePhoneRows,
  mergePrivatePhoneAllowlist,
} from "./carmenPrivatePhoneAllowlist.ts";

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
  ).toBe(true);
  expect(
    out.some(
      (r) =>
        r.phone === "972502222222" &&
        r.label === "אנה" &&
        r.relationship_note === "דבר קצר",
    ),
  ).toBe(true);
  expect(out.some((r) => r.phone === "972503333333" && r.label === "דוד")).toBe(
    true,
  );
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

test("stored phone decoder preserves custom backend metadata and rejects malformed entries", () => {
  const rows = decodePrivatePhoneRows([
    null,
    4,
    { phone: 42 },
    {
      phone: "972501111111",
      source: "custom-source",
      dev_escalation_tier: "custom-tier",
      surfaces: ["whatsapp_private", 42],
      label: "Owner",
    },
  ]);
  expect(rows.length).toBe(1);
  expect(rows[0].source).toBe("custom-source");
  expect(rows[0].dev_escalation_tier).toBe("custom-tier");
  expect(rows[0].surfaces).toStrictEqual(["whatsapp_private"]);
  expect(mergePrivatePhoneAllowlist({ policyPhones: rows }).length).toBe(1);
  expect(decodePrivatePhoneRows(null)).toStrictEqual([]);
});

test("stored custom sources normalize to policy while preserving escalation metadata", () => {
  const stored = decodePrivatePhoneRows([
    {
      phone: "972501111111",
      source: "legacy",
      dev_escalation_tier: "custom-tier",
    },
  ]);
  const merged = mergePrivatePhoneAllowlist({ policyPhones: stored });
  expect(stored[0].source).toBe("legacy");
  expect(merged[0].source).toBe("policy");
  expect(merged[0].dev_escalation_tier).toBe("custom-tier");
});

test("mergePrivatePhoneAllowlist: a bare policy row keeps the identity's tier and note", () => {
  const out = mergePrivatePhoneAllowlist({
    identities: [
      {
        phone: "972502222222",
        display_name: "אנה",
        surfaces: ["whatsapp_private"],
        dev_escalation_tier: "full",
        relationship_note: "דבר קצר",
      },
    ],
    policyPhones: decodePrivatePhoneRows([{ phone: "972502222222" }]),
  });
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({
    source: "policy",
    label: "אנה",
    dev_escalation_tier: "full",
    relationship_note: "דבר קצר",
  });
});

test("decodePrivatePhoneRows: emits only present keys and keeps campaigner/client ids", () => {
  const [bare, full, cleared] = decodePrivatePhoneRows([
    { phone: "972501111111" },
    {
      phone: "972502222222",
      campaigner_id: "camp-1",
      client_id: "client-1",
      source: "custom",
    },
    { phone: "972503333333", dev_escalation_tier: null },
  ]);
  expect(bare).toStrictEqual({ phone: "972501111111" });
  expect(full).toStrictEqual({
    phone: "972502222222",
    campaigner_id: "camp-1",
    client_id: "client-1",
    source: "custom",
  });
  expect(cleared).toStrictEqual({
    phone: "972503333333",
    dev_escalation_tier: null,
  });
});
