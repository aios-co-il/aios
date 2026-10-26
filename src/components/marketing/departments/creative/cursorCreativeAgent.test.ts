import { expect, test } from "vitest";
import {
  buildCreativeAgentPrompt,
  buildCreativeJobBrief,
  formatBrandColorJobBrief,
  formatConceptJobBrief,
  formatReferenceJobBrief,
  formatStyleJobBrief,
  resolvePreviousStyleId,
} from "./cursorCreativeAgent.ts";
import type { CreativeBrandKit } from "./brandKit.ts";

const kit = (overrides: Partial<CreativeBrandKit> = {}): CreativeBrandKit => ({
  logoUrl: "https://cdn.example/logo.png",
  styleReferences: [{ url: "https://cdn.example/ref.jpg", name: "grade" }],
  brandBook: {
    name: "פרומו",
    colors: ["#c00000", "#111111"],
    notes: "",
    source: "auto",
  },
  ...overrides,
});

test("formatConceptJobBrief uses the approved concept fields", () => {
  const block = formatConceptJobBrief({
    name: "הכיס הריק",
    bigIdea: "ארנק פעור מול מסך",
    visualLanguage: "שחור-זהב קולנועי",
    hook: "כיס הפוך",
    copyAngle: "הכסף בורח",
    whyItWorks: "סצנה במקום טקסט",
    reference: "Think Small",
  });
  expect(block).toMatch(/^1\. CONCEPT/);
  expect(block).toMatch(/הכיס הריק/);
  expect(block).toMatch(/ארנק פעור/);
  expect(block).toMatch(/שחור-זהב/);
  expect(block).toMatch(/TYPE only/);
});

test("formatBrandColorJobBrief locks hex colors and admits when none exist", () => {
  expect(formatBrandColorJobBrief(kit())).toMatch(/#c00000/);
  expect(formatBrandColorJobBrief(kit())).toMatch(/hard lock/);
  expect(formatBrandColorJobBrief(kit({ brandBook: undefined }))).toMatch(
    /none on file/,
  );
});

test("formatReferenceJobBrief lists download URLs as a fail-if-skipped block", () => {
  const block = formatReferenceJobBrief([
    { url: "https://cdn.example/ref.jpg", kind: "style" },
    { url: "https://cdn.example/logo.png", kind: "logo" },
  ]);
  expect(block).toMatch(/^3\. CRITICAL REFERENCE URLS/);
  expect(block).toMatch(/https:\/\/cdn\.example\/ref\.jpg/);
  expect(block).toMatch(/https:\/\/cdn\.example\/logo\.png/);
  expect(block).toMatch(/Skipping these is a fail/);
  expect(block).toMatch(/DESIGN SYSTEM LOCK/);
  expect(formatReferenceJobBrief([])).toMatch(/none on file/);
});

test("formatStyleJobBrief names the selected dropdown style and calls out a change", () => {
  const selected = formatStyleJobBrief("swiss");
  expect(selected).toMatch(/מסחרי נקי/);
  expect(selected).toMatch(/swiss/);
  expect(selected).toMatch(/SELECTED STYLE/);
  expect(selected).not.toMatch(/STYLE CHANGE/);
  const changed = formatStyleJobBrief("cinematic", "swiss");
  expect(changed).toMatch(/STYLE CHANGE/);
  expect(changed).toMatch(/מסחרי נקי/);
  expect(changed).toMatch(/קולנועי/);
  expect(changed).toMatch(/Do not keep the old look/);
  expect(formatStyleJobBrief("swiss", "swiss")).not.toMatch(/STYLE CHANGE/);
});

test("resolvePreviousStyleId prefers the replaced card, then sibling source, then last live", () => {
  const live = [
    { visualStyle: "swiss" as const },
    { visualStyle: "cinematic" as const, rejected: true },
    { visualStyle: "industrial" as const },
  ];
  expect(
    resolvePreviousStyleId(
      { visualStyle: "collage" },
      { visualStyle: "swiss" },
      live,
    ),
  ).toBe("collage");
  expect(
    resolvePreviousStyleId(undefined, { visualStyle: "swiss" }, live),
  ).toBe("swiss");
  expect(resolvePreviousStyleId(undefined, undefined, live)).toBe("industrial");
  expect(
    resolvePreviousStyleId({ visualStyle: undefined }, undefined, live),
  ).toBe(undefined);
});

test("buildCreativeJobBrief includes concept, colors, refs, and style", () => {
  const brief = buildCreativeJobBrief({
    concept: {
      name: "הכיס הריק",
      bigIdea: "ארנק פעור",
      visualLanguage: "",
      hook: "כיס",
      copyAngle: "",
      whyItWorks: "",
      reference: "",
    },
    kit: kit(),
    refs: [{ url: "https://cdn.example/ref.jpg", kind: "style" }],
    styleId: "swiss",
    previousStyleId: "cinematic",
  });
  expect(brief).toMatch(/JOB BRIEF/);
  expect(brief).toMatch(/הכיס הריק/);
  expect(brief).toMatch(/#c00000/);
  expect(brief).toMatch(/https:\/\/cdn\.example\/ref\.jpg/);
  expect(brief).toMatch(/מסחרי נקי/);
  expect(brief).toMatch(/STYLE CHANGE/);
});

test("buildCreativeAgentPrompt leads with the job brief then the photograph lock", () => {
  const prompt = buildCreativeAgentPrompt({
    format: "1:1",
    copyText: "כותרת:\nפעם חיפשו אותך.\nCTA:\nהשאירו פרטים",
    visualPrompt:
      "MUST FOLLOW THIS APPROVED VISUAL CONCEPT\nPhotograph a hollow pocket",
    kit: kit(),
    refs: [{ url: "https://cdn.example/ref.jpg", kind: "style" }],
    concept: {
      name: "הכיס הריק",
      bigIdea: "ארנק פעור",
      visualLanguage: "שחור-זהב",
      hook: "כיס הפוך",
      copyAngle: "",
      whyItWorks: "",
      reference: "",
    },
    styleId: "swiss",
    previousStyleId: "cinematic",
  });
  expect(prompt).toMatch(/JOB BRIEF/);
  expect(prompt).toMatch(/הכיס הריק/);
  expect(prompt).toMatch(/BRAND COLORS/);
  expect(prompt).toMatch(/CRITICAL REFERENCE URLS/);
  expect(prompt).toMatch(/https:\/\/cdn\.example\/ref\.jpg/);
  expect(prompt).toMatch(/https:\/\/cdn\.example\/logo\.png/);
  expect(prompt).toMatch(/PROJECT STYLE[\s\S]*מסחרי נקי/);
  expect(prompt).toMatch(/STYLE CHANGE/);
  expect(prompt).toMatch(/CONCEPT PHOTOGRAPH/);
  expect(prompt).toMatch(/פעם חיפשו אותך/);
  const briefAt = prompt.indexOf("JOB BRIEF");
  const photoAt = prompt.indexOf("CONCEPT PHOTOGRAPH");
  expect(briefAt >= 0 && photoAt > briefAt).toBeTruthy();
});
