import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  cfgStringArray,
  cfgText,
  errorMessage,
  parseStepConfig,
} from "@/lib/automationStepConfig";
import { isAutomationTrigger } from "@/lib/automationTriggers";
import { isFlowStepType } from "./flowStepTypes";
import { migrateLegacyRecipients } from "./RecipientsListEditor";
import { migrateLegacyEmailRecipients } from "./EmailRecipientsListEditor";

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
  it("recognises flow step types", () => {
    expect(isFlowStepType("condition")).toBe(true);
    expect(isFlowStepType("bogus")).toBe(false);
  });

  it("recognises DB automation_trigger enum values", () => {
    expect(isAutomationTrigger("lead_created")).toBe(true);
    expect(isAutomationTrigger("scheduled_daily")).toBe(false);
    expect(isAutomationTrigger(undefined)).toBe(false);
  });
});

describe("migrateLegacyRecipients", () => {
  it("keeps valid stored recipients and drops malformed entries", () => {
    expect(
      migrateLegacyRecipients({
        recipients: [
          { type: "phone_manual", phone: "0501234567" },
          { type: "contact_lookup", entity: "lead", id: "l1" },
          { type: "phone_manual" },
          "junk",
        ],
      }),
    ).toEqual([
      { type: "phone_manual", phone: "0501234567" },
      { type: "contact_lookup", entity: "lead", id: "l1" },
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
  it("keeps valid stored recipients and migrates legacy keys", () => {
    expect(
      migrateLegacyEmailRecipients({
        email_recipients: [{ type: "email_manual", email: "a@b.co" }, 3],
      }),
    ).toEqual([{ type: "email_manual", email: "a@b.co" }]);
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
