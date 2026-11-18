import { assertEquals } from "jsr:@std/assert@1";
import { reconnectSettings } from "./reconnect-settings.ts";

Deno.test("reconnecting keeps the lead form mappings", () => {
  const formMappings = { "form-1": { pipeline_id: "p-1" } };

  const settings = reconnectSettings(
    { pages: [{ id: "old" }], form_mappings: formMappings },
    [{ id: "page-1" }],
    "2027-01-01T00:00:00.000Z",
  );

  assertEquals(settings, {
    pages: [{ id: "page-1" }],
    form_mappings: formMappings,
    token_expires_at: "2027-01-01T00:00:00.000Z",
  });
});

Deno.test("a first connection starts from empty settings", () => {
  assertEquals(reconnectSettings(null, [], "2027-01-01T00:00:00.000Z"), {
    pages: [],
    token_expires_at: "2027-01-01T00:00:00.000Z",
  });
});
