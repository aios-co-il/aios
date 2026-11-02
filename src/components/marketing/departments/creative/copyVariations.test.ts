import { expect, test } from "vitest";
import {
  copyBlockLabel,
  copyBlocksForGeneration,
  conceptCopyJobsForGeneration,
  hydrateCopyVariations,
  joinCopyVariations,
  linkApprovedConceptsToCopy,
  linkConceptToGeneratedCopy,
  pairConceptsToCopyVariations,
  remapCopyVariationKeys,
  replaceCopyVariationText,
  applyVariationText,
  splitCopyVariations,
  stampCopiesWithConcept,
  copiesForConcept,
  COPY_VARIATIONS_PER_CONCEPT,
  stripVariationHeader,
  type StoredCopyVariation,
} from "./copyVariations.ts";
import type { CopyConcept } from "../../../copyConcepts.ts";

const DOC = `
וריאציה 1 — AIDA — פומו תחרותי
כותרת:
המתחרים
גוף:
לקוחות כבר לא מחפשים רק בגוגל
CTA:
השאירו פרטים לבדיקת הנוכחות שלכם

וריאציה 2 — PAS — כאב
כותרת:
רודוס
הצעה:
כולל מזוודה וטרולי
CTA:
לצפייה בכל הטיסות
`;

test("splits a Copy-department document into one block per וריאציה", () => {
  const blocks = splitCopyVariations(DOC);
  expect(blocks.length).toBe(2);
  expect(blocks[0].key).toBe("1");
  expect(blocks[0].parts.headline).toBe("המתחרים");
  expect(blocks[0].parts.cta).toBe("השאירו פרטים לבדיקת הנוכחות שלכם");
  expect(blocks[1].key).toBe("2");
  expect(blocks[1].parts.headline).toBe("רודוס");
  expect(blocks[1].parts.offer).toBe("כולל מזוודה וטרולי");
  expect(copyBlockLabel(blocks[0])).toMatch(/פומו תחרותי/);
});

test("bullet variation headers keep the copy angle", () => {
  const [block] = splitCopyVariations(
    "וריאציה 3 • מגולל לצ'אט\nכותרת: תפתח צ'אט",
  );
  expect(block?.angle).toBe("מגולל לצ'אט");
  expect(copyBlockLabel(block!)).toMatch(/מגולל לצ'אט/);
});

test("a document without headers is a single copy block", () => {
  const blocks = splitCopyVariations("כותרת: רודוס\nCTA: הזמינו");
  expect(blocks.length).toBe(1);
  expect(blocks[0].parts.headline).toBe("רודוס");
});

test("multiple כותרת blocks split when there is no וריאציה header", () => {
  const blocks = splitCopyVariations(
    "כותרת:\nאלפא\nCTA: אחד\n\nכותרת:\nבטא\nCTA: שתיים",
  );
  expect(blocks.length).toBe(2);
  expect(blocks[0].parts.headline).toBe("אלפא");
  expect(blocks[1].parts.headline).toBe("בטא");
});

const stored = (
  overrides: Partial<StoredCopyVariation> = {},
): StoredCopyVariation => ({
  id: overrides.id ?? "copy-1",
  key: overrides.key ?? "1",
  label: overrides.label ?? "וריאציה 1",
  angle: overrides.angle,
  text: overrides.text ?? "כותרת:\nאלפא\nCTA: אחד",
  headline: overrides.headline ?? "אלפא",
  cta: overrides.cta ?? "אחד",
  approved: overrides.approved ?? false,
  approvedAt: overrides.approvedAt ?? null,
});

const concept = (overrides: Partial<CopyConcept> = {}): CopyConcept => ({
  id: overrides.id ?? "c1",
  name: overrides.name ?? "הכיס הריק",
  bigIdea: overrides.bigIdea ?? "ארנק פעור",
  visualLanguage: overrides.visualLanguage ?? "",
  hook: overrides.hook ?? "",
  copyAngle: overrides.copyAngle ?? "",
  whyItWorks: overrides.whyItWorks ?? "",
  reference: overrides.reference ?? "",
  copyId: overrides.copyId ?? "",
  copyKey: overrides.copyKey ?? "",
  approved: overrides.approved ?? true,
  approvedAt: overrides.approvedAt ?? "2026-08-26T00:00:00.000Z",
});

test("hydrateCopyVariations preserves approval by variation key", () => {
  const next = hydrateCopyVariations(DOC, [
    stored({
      key: "1",
      approved: true,
      approvedAt: "2026-08-26T00:00:00.000Z",
      id: "keep-1",
    }),
    stored({ key: "2", approved: false, id: "keep-2" }),
  ]);
  expect(next.length).toBe(2);
  expect(next[0].id).toBe("keep-1");
  expect(next[0].approved).toBe(true);
  expect(next[0].headline).toBe("המתחרים");
  expect(next[1].id).toBe("keep-2");
  expect(next[1].approved).toBe(false);
});

test("copyBlocksForGeneration prefers approved copies", () => {
  const blocks = copyBlocksForGeneration({
    copy_text: DOC,
    copy_variations: [
      stored({ key: "1", approved: true }),
      stored({ key: "2", approved: false }),
    ],
  });
  expect(blocks.length).toBe(1);
  expect(blocks[0].key).toBe("1");
  expect(blocks[0].parts.headline).toBe("המתחרים");
});

test("pairConceptsToCopyVariations links by copyKey then by index", () => {
  const copies = [
    stored({ id: "a", key: "1", headline: "אלפא" }),
    stored({ id: "b", key: "2", label: "וריאציה 2", headline: "בטא" }),
  ];
  const paired = pairConceptsToCopyVariations(
    [
      concept({ copyKey: "2" }),
      concept({ id: "c2", name: "שני", copyKey: "" }),
    ],
    copies,
  );
  expect(paired[0].copyId).toBe("b");
  expect(paired[0].copyKey).toBe("2");
  expect(paired[1].copyId).toBe("a");
  expect(paired[1].copyKey).toBe("1");
});

test("conceptCopyJobsForGeneration yields one job per approved concept with its copy", () => {
  const jobs = conceptCopyJobsForGeneration({
    copy_text: DOC,
    copy_variations: [
      stored({ id: "a", key: "1", approved: true, text: "כותרת:\nהמתחרים" }),
      stored({ id: "b", key: "2", approved: true, text: "כותרת:\nרודוס" }),
    ],
    approved_concepts: [
      concept({ id: "c1", name: "Think Small", copyKey: "2" }),
      concept({ id: "c2", name: "Old Spice", copyKey: "1" }),
    ],
  });
  expect(jobs.length).toBe(2);
  expect(jobs[0].concept?.name).toBe("Think Small");
  expect(jobs[0].copy.key).toBe("2");
  expect(jobs[0].copy.text).toMatch(/רודוס/);
  expect(jobs[1].concept?.name).toBe("Old Spice");
  expect(jobs[1].copy.key).toBe("1");
});

test("conceptCopyJobsForGeneration falls back to copy blocks when there are no concepts", () => {
  const jobs = conceptCopyJobsForGeneration({ copy_text: DOC });
  expect(jobs.length).toBe(2);
  expect(jobs[0].concept).toBe(undefined);
  expect(jobs[0].copy.key).toBe("1");
});

test("applyVariationText edits one variation without swallowing siblings", () => {
  const item = stored({
    id: "keep-1",
    key: "1",
    approved: true,
    approvedAt: "2026-08-26T00:00:00.000Z",
    angle: "פומו",
    text: "וריאציה 1 — פומו\nכותרת:\nישן\nCTA:\nישן",
  });
  const next = applyVariationText(item, "כותרת:\nחדש\nCTA:\nלחצו");
  expect(next.id).toBe("keep-1");
  expect(next.key).toBe("1");
  expect(next.approved).toBe(true);
  expect(next.approvedAt).toBe("2026-08-26T00:00:00.000Z");
  expect(next.headline).toBe("חדש");
  expect(next.cta).toBe("לחצו");
  expect(next.text).toMatch(/^וריאציה 1/);
  expect(next.text.includes("וריאציה 2")).toBe(false);
  expect(stripVariationHeader(next.text).includes("חדש")).toBe(true);
});

test("applyVariationText ignores a pasted sibling variation header", () => {
  const item = stored({ id: "b", key: "2", angle: "כאב" });
  const next = applyVariationText(
    item,
    "וריאציה 9 — גנוב\nכותרת:\nרק זה\nCTA:\nכאן",
  );
  expect(next.id).toBe("b");
  expect(next.key).toBe("2");
  expect(next.text).toMatch(/^וריאציה 2/);
  expect(next.text.includes("וריאציה 9")).toBe(false);
  expect(next.headline).toBe("רק זה");
});

test("applyVariationText keeps only the first pasted chunk when a full document is dropped in", () => {
  const item = stored({ id: "a", key: "1", angle: "פומו" });
  const next = applyVariationText(
    item,
    [
      "כותרת:",
      "שלי",
      "CTA:",
      "כאן",
      "",
      "וריאציה 2 — כאב",
      "כותרת:",
      "של אחר",
    ].join("\n"),
  );
  expect(next.key).toBe("1");
  expect(next.headline).toBe("שלי");
  expect(next.text.includes("וריאציה 2")).toBe(false);
  expect(next.text.includes("של אחר")).toBe(false);
});

test("replaceCopyVariationText leaves sibling copy untouched", () => {
  const variations = [
    stored({ id: "a", key: "1", text: "וריאציה 1 — A\nכותרת:\nאלפא" }),
    stored({ id: "b", key: "2", text: "וריאציה 2 — B\nכותרת:\nבטא" }),
  ];
  const next = replaceCopyVariationText(variations, "a", "כותרת:\nגמא");
  expect(next[0].text).toMatch(/גמא/);
  expect(next[1].text).toBe(variations[1].text);
  expect(next[0].id).toBe("a");
  expect(next[1].id).toBe("b");
  const joined = joinCopyVariations(next);
  expect(joined).toMatch(/גמא/);
  expect(joined).toMatch(/בטא/);
  expect(joined.includes("אלפא")).toBe(false);
});

test("remapCopyVariationKeys appends after existing keys with new ids", () => {
  const existing = [stored({ id: "keep", key: "2" })];
  const remapped = remapCopyVariationKeys(
    [stored({ id: "old", key: "1", text: "כותרת:\nחדש", angle: "כאב" })],
    existing,
  );
  expect(remapped.length).toBe(1);
  expect(remapped[0].key).toBe("3");
  expect(remapped[0].id).not.toBe("old");
  expect(remapped[0].text).toMatch(/^וריאציה 3/);
});

test("linkApprovedConceptsToCopy fills only approved concepts that have no copy yet", () => {
  const copies = [
    stored({ id: "n1", key: "3", headline: "חדש" }),
    stored({ id: "n2", key: "4" }),
  ];
  const linked = linkApprovedConceptsToCopy(
    [
      concept({ id: "has", approved: true, copyId: "keep", copyKey: "1" }),
      concept({
        id: "need",
        name: "שני",
        approved: true,
        copyId: "",
        copyKey: "",
      }),
      concept({ id: "skip", name: "שלוש", approved: false, copyId: "" }),
    ],
    copies,
  );
  expect(linked[0].copyId).toBe("keep");
  expect(linked[1].copyId).toBe("n1");
  expect(linked[1].copyKey).toBe("3");
  expect(linked[2].copyId).toBe("");
});

test("stampCopiesWithConcept writes two variations locked to that concept", () => {
  expect(COPY_VARIATIONS_PER_CONCEPT).toBe(2);
  const stamped = stampCopiesWithConcept(
    [
      stored({ id: "a", key: "3", text: "כותרת:\nאלפא" }),
      stored({ id: "b", key: "4", text: "כותרת:\nבטא" }),
    ],
    concept({ id: "c1", name: "הכיס הריק" }),
  );
  expect(stamped.length).toBe(2);
  expect(stamped[0].conceptId).toBe("c1");
  expect(stamped[0].conceptName).toBe("הכיס הריק");
  expect(stamped[0].angle).toBe("הכיס הריק");
  expect(stamped[0].text).toMatch(/הכיס הריק/);
  expect(copiesForConcept(stamped, "c1").length).toBe(2);
});

test("linkConceptToGeneratedCopy sets the primary copy only when empty", () => {
  const copies = [
    stored({ id: "n1", key: "3" }),
    stored({ id: "n2", key: "4" }),
  ];
  const first = linkConceptToGeneratedCopy(
    [concept({ id: "c1", copyId: "", copyKey: "" })],
    "c1",
    copies,
  );
  expect(first[0].copyId).toBe("n1");
  expect(first[0].copyKey).toBe("3");
  const kept = linkConceptToGeneratedCopy(
    [concept({ id: "c1", copyId: "keep", copyKey: "1" })],
    "c1",
    copies,
  );
  expect(kept[0].copyId).toBe("keep");
});
