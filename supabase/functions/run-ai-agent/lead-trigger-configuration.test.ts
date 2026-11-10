import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readLeadTriggerConfiguration } from "./lead-trigger-configuration.ts";

describe("persisted lead trigger configuration", () => {
  it("preserves other trigger settings and nested metadata during a form change", () => {
    const stored = {
      lead_source: "any",
      conditions: { status: ["new"] },
      facebook_form_fields: [{ key: "email", label: "Email", extra: true }],
    };
    assertEquals(
      { ...readLeadTriggerConfiguration(stored), facebook_form_id: "new-form" },
      { ...stored, facebook_form_id: "new-form" },
    );
    assertEquals(readLeadTriggerConfiguration(null), {});
    assertEquals(readLeadTriggerConfiguration(undefined), {});
    assertEquals(readLeadTriggerConfiguration({ lead_source: null }), {
      lead_source: null,
    });
  });

  it("rejects malformed selectors and roots before a write can replace saved settings", () => {
    for (const value of [
      true,
      [],
      "legacy",
      { lead_source: 42 },
      { lead_source: {} },
    ]) {
      assertThrows(
        () => readLeadTriggerConfiguration(value),
        Error,
        "Invalid lead trigger configuration",
      );
    }
  });
});
