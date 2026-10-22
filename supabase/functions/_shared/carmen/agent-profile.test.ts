import assert from "node:assert/strict";
import test from "node:test";
import { agentProfileBlock, readAgentProfile } from "./agent-profile.ts";

test("reads a profile and ignores missing or malformed fields", () => {
  assert.deepEqual(readAgentProfile(null), {});
  assert.deepEqual(readAgentProfile({ profile: "x" }), {});
  assert.deepEqual(
    readAgentProfile({
      profile: { displayName: " Dev Lead ", persona: 3, instructions: "" },
    }),
    {
      displayName: "Dev Lead",
      persona: undefined,
      instructions: undefined,
      avatarPath: undefined,
    },
  );
});

test("builds task instructions only from text fields", () => {
  assert.equal(agentProfileBlock({}), "");
  assert.equal(agentProfileBlock({ avatarPath: "t/a.png" }), "");
  const block = agentProfileBlock({
    displayName: "Dev Lead",
    instructions: "Always open a PR to develop.",
  });
  assert.match(block, /You are "Dev Lead"\./);
  assert.match(block, /Standing instructions:\nAlways open a PR to develop\./);
});
