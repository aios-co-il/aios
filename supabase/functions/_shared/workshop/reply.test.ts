import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackReply } from "./reply.ts";

test("no workshop tool means no fallback", () => {
  assert.equal(fallbackReply([]), null);
  assert.equal(fallbackReply([{ tool: "search_entities", result: {} }]), null);
});

test("the last workshop tool's error or message is what the user hears", () => {
  assert.equal(
    fallbackReply([
      { tool: "workshop_get_state", result: { message: "ישן" } },
      {
        tool: "workshop_make_creative",
        result: { error: "ElevenLabs לא ענה" },
      },
    ]),
    "לא הצלחתי להשלים: ElevenLabs לא ענה",
  );
  assert.equal(
    fallbackReply([
      {
        tool: "workshop_make_creative",
        result: { started: true, message: "התחלתי" },
      },
      { tool: "update_studio_settings", result: {} },
    ]),
    "התחלתי",
  );
  assert.match(
    fallbackReply([
      { tool: "workshop_get_state", result: { success: true } },
    ]) ?? "",
    /מופיע בלוח/,
  );
});
