import { expect, test } from "vitest";
import {
  appendCopyConcepts,
  copyConceptsGenerateGate,
  formatApprovedConceptsForCopy,
  formatCopyConceptsForImagePrompt,
  findCopyConcept,
  isApprovedConceptPrompt,
  parseConceptsFromCarmen,
  pickConceptForBatchIndex,
  resolveVisualPrompt,
  type CopyConcept,
} from "./copyConcepts.ts";

const concept = (overrides: Partial<CopyConcept> = {}): CopyConcept => ({
  id: overrides.id ?? "c1",
  name: overrides.name ?? "הכיס הריק",
  bigIdea: overrides.bigIdea ?? "ארנק פעור מול מסך שחור",
  visualLanguage: overrides.visualLanguage ?? "צילום קולנועי, שחור-זהב",
  hook: overrides.hook ?? "כיס הפוך בשנייה הראשונה",
  copyAngle: overrides.copyAngle ?? "הכסף בורח בזמן שאתם גוללים",
  whyItWorks: overrides.whyItWorks ?? "סצנה במקום טקסט על רקע",
  reference: overrides.reference ?? "VW Think Small",
  copyId: overrides.copyId ?? "",
  copyKey: overrides.copyKey ?? "",
  approved: overrides.approved ?? true,
  approvedAt: overrides.approvedAt ?? "2026-08-24T00:00:00.000Z",
});

test("formatCopyConceptsForImagePrompt forbids restaging the slogan", () => {
  const prompt = formatCopyConceptsForImagePrompt([concept()]);
  expect(prompt.startsWith("MUST FOLLOW THIS APPROVED VISUAL CONCEPT")).toBe(
    true,
  );
  expect(prompt).toMatch(/do NOT choose the scene/i);
  expect(prompt).toMatch(/CONCEPT PHOTOGRAPH — HARD LOCK/);
  expect(prompt).toMatch(/PHOTOGRAPH THIS SCENE/);
  expect(prompt).toMatch(/words only — do not restage/);
  expect(prompt).toMatch(/ארנק פעור/);
  expect(prompt).toMatch(/literal illustration of the copy/);
});

test("resolveVisualPrompt prefers live approved concepts over a stale stored prompt", () => {
  const prompt = resolveVisualPrompt(
    { visual_prompt: "OLD STORED PROMPT ABOUT THE HEADLINE" },
    [concept()],
  );
  expect(prompt).toMatch(/MUST FOLLOW THIS APPROVED VISUAL CONCEPT/);
  expect(prompt).toMatch(/ארנק פעור/);
  expect(prompt).not.toMatch(/OLD STORED PROMPT/);
});

test("resolveVisualPrompt falls back to stored visual_prompt when there are no concepts", () => {
  expect(resolveVisualPrompt({ visual_prompt: "KEEP THIS" }, [])).toBe(
    "KEEP THIS",
  );
  expect(isApprovedConceptPrompt("KEEP THIS")).toBe(false);
  expect(
    isApprovedConceptPrompt(
      "MUST FOLLOW THIS APPROVED VISUAL CONCEPT\nPHOTOGRAPH THIS SCENE: locked door",
    ),
  ).toBe(true);
});

test("formatCopyConceptsForImagePrompt with primaryId locks to that concept only", () => {
  const second = concept({
    id: "c2",
    name: "הכיסא הריק",
    bigIdea: "כיסא מול דלת נעולה",
  });
  const prompt = formatCopyConceptsForImagePrompt([concept(), second], {
    primaryId: "c2",
  });
  expect(prompt).toMatch(/Concept name: הכיסא הריק/);
  expect(prompt).toMatch(/כיסא מול דלת נעולה/);
  expect(prompt).toMatch(/ONLY concept for this still/);
  expect(prompt).not.toMatch(/הכיס הריק/);
  expect(prompt).not.toMatch(/Additional approved concepts/);
  expect(findCopyConcept([concept(), second], "c2")?.name).toBe("הכיסא הריק");
});

test("resolveVisualPrompt with primaryId photographs the chosen approved concept", () => {
  const prompt = resolveVisualPrompt(
    { visual_prompt: "OLD" },
    [concept(), concept({ id: "c2", name: "הקהל", bigIdea: "אולם ריק" })],
    { primaryId: "c2" },
  );
  expect(prompt).toMatch(/אולם ריק/);
  expect(prompt).not.toMatch(/ארנק פעור/);
  expect(prompt).not.toMatch(/Additional approved concepts/);
});

test("pickConceptForBatchIndex prefers unused approved concepts then rotates", () => {
  const concepts = [
    concept({ id: "a", name: "א" }),
    concept({ id: "b", name: "ב" }),
    concept({ id: "c", name: "ג" }),
  ];
  expect(pickConceptForBatchIndex(concepts, 0, ["a"])?.id).toBe("b");
  expect(pickConceptForBatchIndex(concepts, 1, ["a"])?.id).toBe("c");
  expect(pickConceptForBatchIndex(concepts, 2, ["a"])?.id).toBe("b");
  expect(pickConceptForBatchIndex(concepts, 0, ["a", "b", "c"])?.id).toBe("a");
  expect(pickConceptForBatchIndex(concepts, 1, ["a", "b", "c"])?.id).toBe("b");
  expect(pickConceptForBatchIndex([], 0)?.id).toBe(undefined);
});

test("parseConceptsFromCarmen reads copy variation number into copyKey", () => {
  const parsed = parseConceptsFromCarmen(`---CONCEPTS---
### 1 | המקום שלך בתשובה
רעיון: צ'אט ממליץ על מישהו אחר
ויזואל: מסך טלפון
הוק: תוצאות AI
קופי: 2
`);
  expect(parsed[0]?.copyKey).toBe("2");
  expect(parsed[0]?.copyAngle).toBe("2");
});

test("copyConceptsGenerateGate allows concepts from a title or brief without copy", () => {
  expect(
    copyConceptsGenerateGate({
      title: "",
      brief: "",
      copyText: "",
      variationCount: 0,
    }),
  ).toStrictEqual({ canGenerate: false, block: "need_context" });
  expect(
    copyConceptsGenerateGate({ title: "השקה", brief: "", copyText: "" })
      .canGenerate,
  ).toBe(true);
  expect(
    copyConceptsGenerateGate({ title: "", brief: "בריף קצר", copyText: "" })
      .canGenerate,
  ).toBe(true);
});

test("appendCopyConcepts keeps existing cards and skips duplicate names", () => {
  const existing = [concept({ id: "keep", name: "הכיס הריק" })];
  const next = appendCopyConcepts(existing, [
    concept({ id: "dup", name: "הכיס הריק" }),
    concept({ id: "new", name: "הכיסא הריק", bigIdea: "כיסא מול דלת" }),
  ]);
  expect(next.length).toBe(2);
  expect(next[0].id).toBe("keep");
  expect(next[1].id).toBe("new");
});

test("formatApprovedConceptsForCopy lists approved ideas for the copywriter", () => {
  const text = formatApprovedConceptsForCopy([concept()]);
  expect(text).toMatch(/הכיס הריק/);
  expect(text).toMatch(/ארנק פעור/);
  expect(text).toMatch(/סצנה במקום טקסט על רקע/);
});
