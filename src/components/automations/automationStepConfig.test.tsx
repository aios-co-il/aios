import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { z } from "zod";
import {
  cfgNumeric,
  cfgObject,
  cfgObjectArray,
  cfgStringArray,
  cfgText,
  cfgTextArray,
  errorMessage,
  isJsonObject,
  jsonObjectTextSchema,
  listOf,
  parseStepConfig,
} from "./automationStepConfig";
import {
  FORM_TRIGGER_OPTIONS,
  FORM_TRIGGER_VALUES,
  isAutomationTrigger,
} from "@/lib/automationTriggers";
import { flowStepRowToNodeData } from "./flowStepRow";
import { migrateLegacyRecipients } from "./RecipientsListEditor";
import { migrateLegacyEmailRecipients } from "./EmailRecipientsListEditor";
import { toStoredRecipients } from "./storedRecipients";

describe("parseStepConfig", () => {
  it("returns objects as-is, keeping unknown keys", () => {
    const config = { url: "https://x", carmen_extra: { a: 1 } };
    expect(parseStepConfig(config)).toBe(config);
  });

  it("parses JSON object strings and rejects other shapes", () => {
    expect(parseStepConfig('{"a":1}')).toEqual({ a: 1 });
    expect(parseStepConfig("[1]")).toEqual({});
    expect(parseStepConfig("not json")).toEqual({});
    expect(parseStepConfig(null)).toEqual({});
    expect(parseStepConfig([{ a: 1 }])).toEqual({});
  });
});

describe("config accessors", () => {
  it("cfgText stringifies scalars only", () => {
    expect(cfgText("a")).toBe("a");
    expect(cfgText(5)).toBe("5");
    expect(cfgText({ a: 1 })).toBeUndefined();
    expect(cfgText(null)).toBeUndefined();
  });

  it("cfgNumeric keeps numbers and numeric strings", () => {
    expect(cfgNumeric(7)).toBe(7);
    expect(cfgNumeric("7")).toBe(7);
    expect(cfgNumeric("")).toBeUndefined();
    expect(cfgNumeric("abc")).toBeUndefined();
    expect(cfgNumeric(null)).toBeUndefined();
  });

  it("cfgStringArray keeps string entries", () => {
    expect(cfgStringArray(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(cfgStringArray("a")).toBeUndefined();
  });

  it("errorMessage reads .message from error-like objects", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "pg error", code: "42P01" })).toBe(
      "pg error",
    );
    expect(errorMessage("plain")).toBeUndefined();
    expect(errorMessage(null)).toBeUndefined();
  });
});

describe("step/trigger guards", () => {
  it("recognises DB automation_trigger enum values", () => {
    expect(isAutomationTrigger("lead_created")).toBe(true);
    expect(isAutomationTrigger("scheduled_daily")).toBe(false);
    expect(isAutomationTrigger(undefined)).toBe(false);
  });
});

describe("form trigger list", () => {
  it("labels every selectable trigger", () => {
    expect(FORM_TRIGGER_OPTIONS.map((o) => o.value)).toEqual([
      ...FORM_TRIGGER_VALUES,
    ]);
    expect(FORM_TRIGGER_OPTIONS.every((o) => o.label.length > 0)).toBe(true);
  });
});

describe("flowStepRowToNodeData", () => {
  it("keeps an unknown step_type so saving does not rewrite it", () => {
    const node = flowStepRowToNodeData({
      id: "s1",
      automation_id: "a1",
      tenant_id: "t1",
      step_type: "future_step",
      action_type: null,
      label: null,
      configuration: { switch_branches: ["a", 1] },
      position_x: 10,
      position_y: 20,
      sort_order: 2,
      parent_step_id: null,
      condition_branch: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(node.step_type).toBe("future_step");
    expect(node.switch_branches).toEqual(["a"]);
    expect(node.position_x).toBe(10);
  });
});

describe("migrateLegacyRecipients", () => {
  it("coerces numeric ids and keeps unsupported entries for round-trip", () => {
    const stored = [
      { type: "phone_manual", phone: "0501234567" },
      { type: "phone_manual", phone: 972501234567 },
      { type: "contact_lookup", entity: "lead", id: 42 },
      { type: "phone_manual" },
      { type: "future_type", target: "x" },
      "junk",
    ];
    const entries = migrateLegacyRecipients({ recipients: stored });
    expect(entries).toEqual([
      { type: "phone_manual", phone: "0501234567" },
      { type: "phone_manual", phone: "972501234567" },
      { type: "contact_lookup", entity: "lead", id: "42" },
      { type: "unsupported", raw: { type: "phone_manual" } },
      { type: "unsupported", raw: { type: "future_type", target: "x" } },
      { type: "unsupported", raw: "junk" },
    ]);
    expect(toStoredRecipients(entries)).toEqual([
      { type: "phone_manual", phone: "0501234567" },
      { type: "phone_manual", phone: "972501234567" },
      { type: "contact_lookup", entity: "lead", id: "42" },
      { type: "phone_manual" },
      { type: "future_type", target: "x" },
      "junk",
    ]);
  });

  it("migrates legacy phone modes", () => {
    expect(
      migrateLegacyRecipients({ phone_mode: "manual", manual_phone: "050" }),
    ).toEqual([{ type: "phone_manual", phone: "050" }]);
    expect(migrateLegacyRecipients({ phone_mode: "group_field" })).toEqual([
      { type: "group_field", field: "group_chat_id" },
    ]);
    expect(migrateLegacyRecipients({})).toEqual([
      { type: "phone_field", field: "phone" },
    ]);
  });
});

describe("migrateLegacyEmailRecipients", () => {
  it("keeps stored recipients (unsupported ones verbatim) and migrates legacy keys", () => {
    const entries = migrateLegacyEmailRecipients({
      email_recipients: [
        { type: "email_manual", email: "a@b.co" },
        { type: "contact_lookup", entity: "client", id: 7 },
        3,
      ],
    });
    expect(entries).toEqual([
      { type: "email_manual", email: "a@b.co" },
      { type: "contact_lookup", entity: "client", id: "7" },
      { type: "unsupported", raw: 3 },
    ]);
    expect(toStoredRecipients(entries)).toEqual([
      { type: "email_manual", email: "a@b.co" },
      { type: "contact_lookup", entity: "client", id: "7" },
      3,
    ]);
    expect(migrateLegacyEmailRecipients({ to_email: "x@y.co" })).toEqual([
      { type: "email_manual", email: "x@y.co" },
    ]);
    expect(migrateLegacyEmailRecipients({ email_field: "work_email" })).toEqual(
      [{ type: "email_field", field: "work_email" }],
    );
    expect(migrateLegacyEmailRecipients({})).toEqual([
      { type: "email_field", field: "email" },
    ]);
  });
});

describe("jsonObjectSchema helpers", () => {
  it("isJsonObject accepts plain objects only", () => {
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject("x")).toBe(false);
  });

  it("cfgObject keeps the same object", () => {
    const value = { a: 1 };
    expect(cfgObject(value)).toBe(value);
    expect(cfgObject([1])).toBeUndefined();
  });

  it("cfgObjectArray and cfgTextArray drop unsupported items", () => {
    expect(cfgObjectArray([{ a: 1 }, null, [2], "x"])).toEqual([{ a: 1 }]);
    expect(cfgTextArray(["a", 2, true, null, {}])).toEqual(["a", "2", "true"]);
    expect(cfgTextArray("a")).toBeUndefined();
  });

  it("listOf keeps items matching the schema", () => {
    expect(listOf(z.number(), [1, "2", 3])).toEqual([1, 3]);
    expect(listOf(z.number(), { a: 1 })).toBeUndefined();
  });

  it("jsonObjectTextSchema parses JSON object text only", () => {
    expect(jsonObjectTextSchema.safeParse('{"a":1}').data).toEqual({ a: 1 });
    expect(jsonObjectTextSchema.safeParse("[1]").success).toBe(false);
    expect(jsonObjectTextSchema.safeParse("{").success).toBe(false);
    expect(jsonObjectTextSchema.safeParse(5).success).toBe(false);
  });
});

describe("migrateLegacyRecipients schemas", () => {
  it("rejects non-finite ids and unknown contact entities", () => {
    expect(
      migrateLegacyRecipients({
        recipients: [
          { type: "contact_lookup", entity: "vendor", id: "1" },
          { type: "group_lookup", group_id: 12, extra: "x" },
        ],
      }),
    ).toEqual([
      {
        type: "unsupported",
        raw: { type: "contact_lookup", entity: "vendor", id: "1" },
      },
      { type: "group_lookup", group_id: "12" },
    ]);
  });
});
