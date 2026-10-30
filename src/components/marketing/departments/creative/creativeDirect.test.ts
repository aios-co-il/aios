import { expect, test } from "vitest";
import {
  CREATIVE_DIRECT_IDENTITY,
  CREATIVE_DIRECT_JOB_PREAMBLE,
  CREATIVE_DIRECT_LABEL_HE,
  CREATIVE_DIRECT_NAME,
  CREATIVE_DIRECT_OPEN_MARKER,
  CREATIVE_DIRECT_OPEN_PROMPT,
  CREATIVE_DIRECT_SKILL_PATH,
  CREATIVE_DIRECT_SKIN_SLUG,
} from "./creativeDirect.ts";

test("user-facing label is קריאייטיב דיירקט only", () => {
  expect(CREATIVE_DIRECT_LABEL_HE).toBe("קריאייטיב דיירקט");
  expect(CREATIVE_DIRECT_LABEL_HE).not.toMatch(/כרמן ישיר/);
  expect(CREATIVE_DIRECT_NAME).toMatch(/Creative Direct/);
});

test("standing skill is a file plus Carmen skin, not a per-job lecture", () => {
  expect(CREATIVE_DIRECT_SKIN_SLUG).toBe("creative_direct");
  expect(CREATIVE_DIRECT_SKILL_PATH).toMatch(/creative-direct\/SKILL.md/);
  expect(CREATIVE_DIRECT_OPEN_PROMPT).toMatch(/STANDING SKILL/);
  expect(CREATIVE_DIRECT_OPEN_PROMPT).toMatch(/ai_skills.creative_direct/);
  expect(CREATIVE_DIRECT_JOB_PREAMBLE).toMatch(/JOB only/);
  expect(CREATIVE_DIRECT_JOB_PREAMBLE).toMatch(/Do not ask to be re-briefed/);
  expect(CREATIVE_DIRECT_IDENTITY).toMatch(/GenerateImage/);
});

test("sticky lookup marker is distinct from per-job dispatches", () => {
  expect(CREATIVE_DIRECT_OPEN_MARKER).toBe(
    "[CREATIVE AGENT] opened Creative Direct",
  );
  expect(CREATIVE_DIRECT_OPEN_MARKER.startsWith("[CREATIVE AGENT]")).toBe(true);
});
