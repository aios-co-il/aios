import { expect, test } from "vitest";
import {
  buildCursorArtDirectorLock,
  collectStaticReferencePlan,
  labelStaticRef,
  wantsTalentLock,
  STATIC_CAST_LOCK,
  LOGO_PLACEMENT_LOCK,
} from "./cursorArtDirector.ts";

const kit = {
  logoUrl: "https://example.com/logo.png",
  styleReferences: [{ url: "https://example.com/person.jpg", name: "talent" }],
  brandBook: {
    name: "פרומו",
    colors: ["#c00000"],
    notes: "",
    source: "auto" as const,
  },
};

test("talent lock fires on the Hebrew character instruction", () => {
  expect(wantsTalentLock("תשתמש בדמות מהרפרנס")).toBe(true);
  expect(wantsTalentLock("keep the same color grade")).toBe(false);
});

test("static refs attach the spokesman first when instructions ask for the character", () => {
  const plan = collectStaticReferencePlan({
    projectRefUrls: ["https://talent"],
    techniqueUrl: "https://technique",
    instructions: "תשתמש בדמות מהרפרנס",
  });
  expect(plan.urls).toStrictEqual(["https://talent", "https://technique"]);
  expect(plan.role).toBe("talent");
  expect(plan.refs[0].kind).toBe("talent");
  expect(plan.refs[1].kind).toBe("technique");
});

test("without a talent instruction, project refs are style not faces", () => {
  const plan = collectStaticReferencePlan({
    projectRefUrls: ["https://style"],
    techniqueUrl: "https://technique",
    instructions: "",
  });
  expect(plan.urls).toStrictEqual(["https://style", "https://technique"]);
  expect(plan.role).toBe("technique");
  expect(plan.refs[0].kind).toBe("style");
  expect(plan.refs[1].kind).toBe("technique");
});

test("revision target is first, then talent, then technique up to three refs", () => {
  const plan = collectStaticReferencePlan({
    projectRefUrls: ["https://talent"],
    techniqueUrl: "https://technique",
    instructions: "תשתמש בדמות מהרפרנס",
    editTargetUrl: "https://ad.png",
  });
  expect(plan.urls).toStrictEqual([
    "https://ad.png",
    "https://talent",
    "https://technique",
  ]);
  expect(plan.role).toBe("revision");
});

test("reject director references sit next to the edit target", () => {
  const plan = collectStaticReferencePlan({
    projectRefUrls: ["https://style"],
    directorUrls: ["https://want-this.png"],
    instructions: "",
    editTargetUrl: "https://ad.png",
  });
  expect(plan.urls).toStrictEqual([
    "https://ad.png",
    "https://want-this.png",
    "https://style",
  ]);
  expect(plan.role).toBe("revision");
});

test("logo is always attached even when three other refs already fill the slot", () => {
  const plan = collectStaticReferencePlan({
    projectRefUrls: ["https://style"],
    directorUrls: ["https://want-this.png"],
    editTargetUrl: "https://ad.png",
    logoUrl: "https://logo.png",
  });
  expect(
    plan.refs.some(
      (item) => item.kind === "logo" && item.url === "https://logo.png",
    ),
  ).toBe(true);
  expect(plan.urls.includes("https://logo.png")).toBe(true);
  const labeled = labelStaticRef({ url: "https://logo.png", kind: "logo" }, 0);
  expect(labeled).toMatch(/LOGO 1/);
  expect(labeled).toMatch(/will NOT overlay/i);
});

test("art director lock paints Hebrew RTL unless live text is on", () => {
  const lock = buildCursorArtDirectorLock({
    format: "1:1",
    instructions: "תשתמש בדמות מהרפרנס",
    kit,
    hasTalentRef: true,
  });
  expect(lock).toMatch(/CURSOR ART DIRECTOR/);
  expect(lock).toMatch(/SUBJECT FIRST/);
  expect(lock).toMatch(/TALENT LOCK/);
  expect(lock).toMatch(/דמות מהרפרנס/);
  expect(lock).toMatch(/paint the quoted Hebrew/i);
  expect(lock).toMatch(/פרומו/);
  expect(lock).toMatch(/LOGO PLACEMENT/i);
  expect(lock).not.toMatch(/do not paint any letters/i);
  expect(lock).not.toMatch(/CONCEPT FIRST/);
  expect(lock).not.toMatch(/STATIC STILL/);
});

test("approved-concept art director lock photographs the concept and types the copy", () => {
  const lock = buildCursorArtDirectorLock({
    format: "1:1",
    instructions: "",
    kit,
    hasApprovedConcept: true,
  });
  expect(lock).toMatch(/CONCEPT FIRST/);
  expect(lock).toMatch(/TYPE on the concept photograph/);
  expect(lock).toMatch(/STATIC STILL/);
  expect(lock).not.toMatch(/SUBJECT FIRST/);
  expect(lock).not.toMatch(/TALENT LOCK/);
});

test("project style refs are labeled as style, not talent", () => {
  const style = labelStaticRef(
    { url: "https://example.com/style.jpg", kind: "style" },
    0,
  );
  expect(style).toMatch(/STYLE REFERENCE 1 — PRIMARY DESIGN ANCHOR/);
  expect(style).toMatch(/layout architecture/);
  expect(style).not.toMatch(/keep this face/i);
  const talent = labelStaticRef(
    { url: "https://example.com/face.jpg", kind: "talent" },
    0,
  );
  expect(talent).toMatch(/Talent \/ spokesman 1/);
  expect(STATIC_CAST_LOCK).toMatch(/not a storyboard beat/);
  expect(LOGO_PLACEMENT_LOCK).toMatch(/does NOT overlay/i);
  expect(LOGO_PLACEMENT_LOCK).toMatch(/bottom-corner/i);
});

test("live-text art director lock leaves type as composited RTL", () => {
  const lock = buildCursorArtDirectorLock({
    format: "1:1",
    instructions: "תשתמש בדמות מהרפרנס",
    kit,
    hasTalentRef: true,
    liveTextLayers: true,
  });
  expect(lock).toMatch(/do not paint any letters/i);
  expect(lock).toMatch(/dir=rtl/);
  expect(lock).toMatch(/unicode-bidi:isolate/);
  expect(lock).toMatch(/LOGO PLACEMENT/);
  expect(lock).toMatch(/paint the real brand logo/i);
});
