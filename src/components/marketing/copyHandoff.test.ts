import { expect, test } from "vitest";
import {
  formatCopyConceptsForImagePrompt,
  type CopyConcept,
} from "./copyConcepts.ts";
import {
  findExistingCreativeSibling,
  overlayCopyHandoffPayload,
  stampCopyPayloadAfterHandoff,
  listOpenCreativeProjects,
  suggestedCreativeTarget,
  copyPullSummary,
  type HandoffWorkItem,
} from "./copyHandoff.ts";
import { isCopyDepartmentItem } from "./departmentFilters.ts";

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

const item = (
  overrides: Partial<HandoffWorkItem> & { id: string },
): HandoffWorkItem => ({
  title: "קמפיין קיץ",
  payload: {},
  client_id: "client-1",
  updated_at: "2026-08-24T10:00:00.000Z",
  ...overrides,
});

test("findExistingCreativeSibling prefers the copy item pointer", () => {
  const copy = item({
    id: "copy-1",
    payload: { handoff_to_creative_item_id: "creative-old" },
  });
  const hit = findExistingCreativeSibling(copy, [
    item({
      id: "creative-new",
      payload: { linked_copy_item_id: "copy-1" },
      updated_at: "2026-08-25T10:00:00.000Z",
    }),
    item({
      id: "creative-old",
      title: "שם אחר",
      payload: { intake_source: "copy_link" },
    }),
  ]);
  expect(hit?.id).toBe("creative-old");
});

test("findExistingCreativeSibling falls back to linked_copy_item_id, newest first", () => {
  const copy = item({ id: "copy-1" });
  const hit = findExistingCreativeSibling(copy, [
    item({
      id: "older",
      payload: { linked_copy_item_id: "copy-1" },
      updated_at: "2026-08-20T00:00:00.000Z",
    }),
    item({
      id: "newer",
      payload: { linked_copy_item_id: "copy-1" },
      updated_at: "2026-08-24T00:00:00.000Z",
    }),
  ]);
  expect(hit?.id).toBe("newer");
});

test("findExistingCreativeSibling matches same title + copy_link on the same client", () => {
  const copy = item({ id: "copy-1", title: "קמפיין קיץ" });
  const hit = findExistingCreativeSibling(copy, [
    item({
      id: "creative-1",
      title: "קמפיין קיץ",
      payload: { intake_source: "copy_link", department: "creative" },
    }),
    item({
      id: "unrelated",
      title: "קמפיין קיץ",
      payload: { department: "creative" },
    }),
  ]);
  expect(hit?.id).toBe("creative-1");
});

test("findExistingCreativeSibling ignores a same-title manual creative", () => {
  const copy = item({ id: "copy-1" });
  const hit = findExistingCreativeSibling(copy, [
    item({
      id: "manual",
      payload: { department: "creative", intake_source: "manual" },
    }),
  ]);
  expect(hit).toBe(null);
});

test("overlayCopyHandoffPayload keeps existing variations and writes visual_prompt first", () => {
  const approved = [concept()];
  const payload = overlayCopyHandoffPayload({
    existingPayload: {
      department: "creative",
      project_type: "static",
      format: "4:5",
      variations: [{ id: "v1", imageUrl: "https://example.com/a.png" }],
      image_url: "https://example.com/a.png",
      intake_source: "copy_link",
    },
    copyPayload: { copy_text: "כותרת\nגוף", brief_text: "בריף" },
    copyItem: { id: "copy-1", title: "קמפיין קיץ" },
    concepts: approved,
    approved,
    at: "2026-08-25T09:00:00.000Z",
  });
  expect(payload.department).toBe("creative");
  expect(payload.project_type).toBe("static");
  expect(payload.format).toBe("4:5");
  expect(payload.intake_source).toBe("copy_link");
  expect(payload.linked_copy_item_id).toBe("copy-1");
  expect(payload.variations).toStrictEqual([
    { id: "v1", imageUrl: "https://example.com/a.png" },
  ]);
  expect(String(payload.visual_prompt)).toMatch(
    /MUST FOLLOW THIS APPROVED VISUAL CONCEPT/,
  );
  expect(String(payload.visual_prompt)).toMatch(/ארנק פעור/);
  expect(String(payload.visual_prompt)).toMatch(/PHOTOGRAPH THIS SCENE/);
  expect((payload.approved_concepts as CopyConcept[])[0]?.name).toBe(
    "הכיס הריק",
  );
});

test("stampCopyPayloadAfterHandoff keeps the item in copy", () => {
  const stamped = stampCopyPayloadAfterHandoff(
    { copy_text: "טקסט", department: "copy" },
    "creative-1",
    "2026-08-25T09:00:00.000Z",
  );
  expect(stamped.department).toBe("copy");
  expect(stamped.handoff_to_creative_item_id).toBe("creative-1");
  expect(isCopyDepartmentItem({ payload: stamped }, "copy-stage")).toBe(true);
});

test("formatCopyConceptsForImagePrompt leads with the approved concept", () => {
  const prompt = formatCopyConceptsForImagePrompt([
    concept(),
    concept({ id: "c2", name: "וריאציה שנייה", bigIdea: "זווית אחרת" }),
  ]);
  expect(prompt.startsWith("MUST FOLLOW THIS APPROVED VISUAL CONCEPT")).toBe(
    true,
  );
  expect(prompt).toMatch(/Concept name: הכיס הריק/);
  expect(prompt).toMatch(/PHOTOGRAPH THIS SCENE/);
  expect(prompt).toMatch(/2\. וריאציה שנייה/);
});

test("listOpenCreativeProjects returns every open creative for the client", () => {
  const copy = item({ id: "copy-1" });
  const open = listOpenCreativeProjects(copy, [
    item({
      id: "linked",
      payload: { linked_copy_item_id: "copy-1", department: "creative" },
    }),
    item({
      id: "manual",
      title: "באנר קיץ",
      payload: { department: "creative", intake_source: "manual" },
    }),
    item({
      id: "archived",
      payload: { department: "creative" },
      status: "archived",
    }),
    item({
      id: "other-client",
      client_id: "client-2",
      payload: { department: "creative" },
    }),
    item({ id: "copy-self", payload: { department: "copy" } }),
  ]);
  expect(open.map((row) => row.id)).toStrictEqual(["linked", "manual"]);
});

test("overlayCopyHandoffPayload keeps existing concepts when the copy has none", () => {
  const existingConcept = concept({ id: "keep" });
  const payload = overlayCopyHandoffPayload({
    existingPayload: {
      department: "creative",
      copy_concepts: [existingConcept],
      approved_concepts: [existingConcept],
    },
    copyPayload: { copy_text: "כותרת חדשה", brief_text: "בריף" },
    copyItem: { id: "copy-2", title: "seo / geo" },
    concepts: [],
    approved: [],
    at: "2026-08-25T09:00:00.000Z",
  });
  expect((payload.copy_concepts as CopyConcept[])[0]?.id).toBe("keep");
  expect((payload.approved_concepts as CopyConcept[])[0]?.id).toBe("keep");
  expect(payload.copy_text).toBe("כותרת חדשה");
});

test("overlayCopyHandoffPayload keeps an existing visual_prompt when nothing is approved", () => {
  const payload = overlayCopyHandoffPayload({
    existingPayload: {
      department: "creative",
      visual_prompt: "KEEP THIS",
      notes: "הערת קריאייטיב",
    },
    copyPayload: { copy_text: "כותרת" },
    copyItem: { id: "copy-1", title: "seo / geo" },
    concepts: [concept({ approved: false, approvedAt: null })],
    approved: [],
    at: "2026-08-25T09:00:00.000Z",
  });
  expect(payload.visual_prompt).toBe("KEEP THIS");
  expect(payload.copy_text).toBe("כותרת");
  expect(payload.linked_copy_item_id).toBe("copy-1");
  expect((payload.copy_concepts as CopyConcept[])[0]?.approved).toBe(false);
});

test("copyPullSummary marks items with copy or concepts as pullable", () => {
  expect(copyPullSummary({ copy_text: "כותרת" }).pullable).toBe(true);
  expect(copyPullSummary({ copy_concepts: [concept()] }).pullable).toBe(true);
  expect(copyPullSummary({ copy_concepts: [concept()] }).approvedCount).toBe(1);
  expect(copyPullSummary({ brief_text: "בריף בלבד" }).pullable).toBe(true);
  expect(copyPullSummary({}).pullable).toBe(false);
});

test("suggestedCreativeTarget prefers the linked sibling among open projects", () => {
  const copy = item({
    id: "copy-1",
    payload: { handoff_to_creative_item_id: "pointed" },
  });
  const open = [
    item({
      id: "newer-manual",
      payload: { department: "creative" },
      updated_at: "2026-08-25T12:00:00.000Z",
    }),
    item({
      id: "pointed",
      payload: { department: "creative" },
      updated_at: "2026-08-24T10:00:00.000Z",
    }),
  ];
  expect(suggestedCreativeTarget(copy, open)?.id).toBe("pointed");
});

test("overlayCopyHandoffPayload writes approved copies only and pairs concept copyKey", () => {
  const approved = [concept({ copyKey: "2" })];
  const payload = overlayCopyHandoffPayload({
    existingPayload: { department: "creative" },
    copyPayload: {
      copy_text: "וריאציה 1\nכותרת:\nאלפא\n\nוריאציה 2\nכותרת:\nבטא",
      copy_variations: [
        {
          id: "a",
          key: "1",
          label: "וריאציה 1",
          text: "וריאציה 1\nכותרת:\nאלפא",
          approved: false,
        },
        {
          id: "b",
          key: "2",
          label: "וריאציה 2",
          text: "וריאציה 2\nכותרת:\nבטא",
          approved: true,
        },
      ],
    },
    copyItem: { id: "copy-1", title: "seo / geo" },
    concepts: approved,
    approved,
    at: "2026-08-26T09:00:00.000Z",
  });
  expect(String(payload.copy_text)).toMatch(/בטא/);
  expect(String(payload.copy_text)).not.toMatch(/אלפא/);
  const variations = payload.copy_variations as Array<{
    key: string;
    approved: boolean;
  }>;
  expect(variations.length).toBe(2);
  expect(variations.filter((row) => row.approved).length).toBe(1);
  expect((payload.approved_concepts as CopyConcept[])[0]?.copyKey).toBe("2");
  expect((payload.approved_concepts as CopyConcept[])[0]?.copyId).toBe("b");
});
