import { expect, test } from "vitest";
import {
  captionStyleOf,
  displayWord,
  isLtrWord,
  keyScore,
  lineCharsFor,
  motionCaptions,
  phraseLines,
  phraseSizes,
} from "../src/compose/motion-captions.mjs";
import {
  SKIN_FRAMES,
  isSkinSwitch,
  sceneTransitionFor,
} from "../src/compose/skin-switch.mjs";

/** Words said one after another, `gap` frames apart, each 6 frames long. */
const said = (text, { from = 0, gap = 8 } = {}) =>
  text.split(" ").map((word, i) => ({
    text: word,
    startFrame: from + i * gap,
    endFrame: from + i * gap + 6,
  }));
const phrases = (captions) =>
  captions.map((c) => c.words.map((w) => w.text).join(" "));

test("the caption style is motion unless the film asks for karaoke", () => {
  expect(captionStyleOf(undefined)).toBe("motion");
  expect(captionStyleOf("motion")).toBe("motion");
  expect(captionStyleOf("karaoke")).toBe("karaoke");
  expect(captionStyleOf("bogus")).toBe("motion");
});

test("phrases hold two to four words, balanced, and do not end on a leaning word", () => {
  expect(phraseSizes(["א", "ב", "ג"])).toStrictEqual([3]);
  expect(phraseSizes("1 2 3 4 5".split(" "))).toStrictEqual([3, 2]);
  expect(phraseSizes("1 2 3 4 5 6".split(" "))).toStrictEqual([3, 3]);
  expect(phraseSizes("1 2 3 4 5 6 7 8 9".split(" "))).toStrictEqual([3, 3, 3]);
  // "מנהלת השיווק של | העסק שלך" would end on "של".
  expect(phraseSizes("מנהלת השיווק של העסק שלך".split(" "))).toStrictEqual([
    2, 3,
  ]);
  const captions = motionCaptions(said("מנהלת השיווק של העסק שלך."), {
    fps: 30,
  });
  expect(phrases(captions)).toStrictEqual(["מנהלת השיווק", "של העסק שלך"]);
});

test("a sentence end, a pause or a cut ends a phrase; a lone word after a comma joins", () => {
  const words = [
    ...said("הכירו את כרמן."),
    ...said("היא כאן", { from: 30 }),
    // A pause of more than a third of a second.
    ...said("ועכשיו", { from: 80 }),
    ...said("גם בגוגל", { from: 90 }),
  ];
  expect(phrases(motionCaptions(words, { fps: 30 }))).toStrictEqual([
    "הכירו את כרמן",
    "היא כאן",
    "ועכשיו גם בגוגל",
  ]);
  // A scene starts at frame 98: "בגוגל" is said in the next scene.
  expect(
    phrases(motionCaptions(words, { fps: 30, breaks: [98] })),
  ).toStrictEqual(["הכירו את כרמן", "היא כאן", "ועכשיו גם", "בגוגל"]);
  // "כן," alone joins the clause after it.
  expect(
    phrases(motionCaptions(said("כן, היא עושה הכל"), { fps: 30 })),
  ).toStrictEqual(["כן היא עושה הכל"]);
  // A dash between clauses is not shown.
  expect(
    phrases(motionCaptions(said("הירשמו עכשיו — 1000 הראשונים"), { fps: 30 })),
  ).toStrictEqual(["הירשמו עכשיו", "1000 הראשונים"]);
});

test("a phrase lasts until the next one or a short hold, and stops at the scenes' end", () => {
  const captions = motionCaptions(
    [...said("אחת שתיים."), ...said("שלוש ארבע", { from: 100 })],
    { fps: 30, endFrame: 110 },
  );
  expect(captions[0]).toMatchObject({ startFrame: 0, endFrame: 25 });
  expect(captions[1]).toMatchObject({ startFrame: 100, endFrame: 110 });
});

test("captions show words without sentence punctuation; ? and ! stay", () => {
  expect(displayWord("כרמן.")).toBe("כרמן");
  expect(displayWord("קמפיינים,")).toBe("קמפיינים");
  expect(displayWord("״שלום״")).toBe("שלום");
  expect(displayWord("קמפיינרים?")).toBe("קמפיינרים?");
  expect(displayWord("ה-AI,")).toBe("ה-AI");
  expect(displayWord("24/7")).toBe("24/7");
  expect(displayWord("—")).toBe("");
});

test("the key word is a number, the brand, a title word, a Latin term or an emphatic word", () => {
  const title = ["קמפיינרית"];
  expect(keyScore("8", {})).toBe(5);
  expect(keyScore("אלף", {})).toBe(5);
  expect(keyScore("ושמונה", {})).toBe(5);
  expect(keyScore("כרמן", { brand: ["כרמן"] })).toBe(4);
  expect(keyScore("ולכרמן", { brand: ["כרמן"] })).toBe(0);
  expect(keyScore("בכרמן", { brand: ["כרמן"] })).toBe(4);
  expect(keyScore("קמפיינרית", { title })).toBe(3);
  expect(keyScore("SEO", {})).toBe(2);
  expect(keyScore("בחינם", {})).toBe(1);
  expect(keyScore("הבא!", {})).toBe(1);
  expect(keyScore("של", { title: ["של"] })).toBe(0);
  expect(keyScore("שלום", {})).toBe(0);
  // One key word per phrase: the strongest, the first on a tie.
  const [phrase] = motionCaptions(said("כבר החלפת 8 קמפיינרים?"), {
    fps: 30,
    scenes: [{ startFrame: 0, title: "קמפיינרים" }],
  });
  expect(phrase.words.filter((w) => w.key).map((w) => w.text)).toStrictEqual([
    "8",
  ]);
  const [plain] = motionCaptions(said("בואו נדבר"), { fps: 30 });
  expect(plain.words.some((w) => w.key)).toBe(false);
});

test("Latin words and numbers read left to right inside a Hebrew line", () => {
  expect(isLtrWord("SEO")).toBe(true);
  expect(isLtrWord("100%")).toBe(true);
  expect(isLtrWord("24/7")).toBe(true);
  expect(isLtrWord("ה-AI")).toBe(false);
  expect(isLtrWord("כרמן")).toBe(false);
  const [phrase] = motionCaptions(said("הכירו את Carmen Marketing"), {
    fps: 30,
    maxLineChars: 40,
  });
  expect(phrase.words.map((w) => w.ltr === true)).toStrictEqual([
    false,
    false,
    true,
    true,
  ]);
});

test("a long phrase takes two balanced lines; a short one stays on one", () => {
  expect(phraseLines([4, 5], 15)).toStrictEqual([0, 0]);
  expect(phraseLines([6, 4, 7], 15)).toStrictEqual([0, 0, 1]);
  expect(phraseLines([3, 7, 6, 4], 15)).toStrictEqual([0, 0, 1, 1]);
  expect(phraseLines([20], 15)).toStrictEqual([0]);
  expect(lineCharsFor("9:16")).toBeLessThan(lineCharsFor("16:9"));
  const [wide] = motionCaptions(said("אלף הנרשמים הראשונים יקבלו"), {
    fps: 30,
    maxLineChars: lineCharsFor("16:9"),
  });
  expect(wide.words.every((w) => w.line === 0)).toBe(true);
  const [tall] = motionCaptions(said("אלף הנרשמים הראשונים יקבלו"), {
    fps: 30,
    maxLineChars: lineCharsFor("9:16"),
  });
  expect(tall.words.map((w) => w.line)).toStrictEqual([0, 0, 1, 1]);
});

test("a cut between two pictures of the character is a skin switch", () => {
  const a = { stillPath: "/x/a.jpg", pictureKey: "asset-a" };
  const b = { stillPath: "/x/b.jpg", pictureKey: "asset-b" };
  // A trailer (sound design) switches skin at every new picture.
  expect(isSkinSwitch(a, b, { soundDesign: true })).toBe(true);
  expect(
    isSkinSwitch(a, { ...b, pictureKey: "asset-a" }, { soundDesign: true }),
  ).toBe(false);
  // Without sound design: only when both scenes wear their own, different skin references.
  expect(isSkinSwitch(a, b)).toBe(false);
  expect(
    isSkinSwitch(
      { ...a, skinRef: "https://x/skin-1.jpg" },
      { ...b, skinRef: "https://x/skin-2.jpg" },
    ),
  ).toBe(true);
  // The scene's own say wins, and an asked-for transition is kept.
  expect(isSkinSwitch(a, { ...b, skinSwitch: true })).toBe(true);
  expect(
    isSkinSwitch(a, { ...b, skinSwitch: false }, { soundDesign: true }),
  ).toBe(false);
  expect(
    isSkinSwitch(a, { ...b, transition: "wipe" }, { soundDesign: true }),
  ).toBe(false);
  expect(isSkinSwitch(null, b, { soundDesign: true })).toBe(false);
  // Without source keys the pictures' paths are compared.
  expect(
    isSkinSwitch(
      { stillPath: "/x/a.jpg" },
      { stillPath: "/x/a.jpg" },
      { soundDesign: true },
    ),
  ).toBe(false);
});

test("a skin switch is a short transition, else a cut with too little room keeps the cycle", () => {
  expect(
    sceneTransitionFor(1, null, { skin: true, previousFrames: 90, frames: 90 }),
  ).toStrictEqual({ transition: "skin", transitionFrames: SKIN_FRAMES });
  expect(SKIN_FRAMES).toBeGreaterThanOrEqual(8);
  expect(SKIN_FRAMES).toBeLessThanOrEqual(12);
  // A short scene: a third of it.
  expect(
    sceneTransitionFor(1, null, { skin: true, previousFrames: 90, frames: 24 }),
  ).toStrictEqual({ transition: "skin", transitionFrames: 8 });
  // Too short for the flash: the usual transition.
  expect(
    sceneTransitionFor(1, null, { skin: true, previousFrames: 90, frames: 15 }),
  ).toStrictEqual({ transition: "crossfade", transitionFrames: 5 });
  // The first scene opens from black.
  expect(
    sceneTransitionFor(0, null, { skin: true, previousFrames: 0, frames: 90 }),
  ).toStrictEqual({ transition: "cut", transitionFrames: 0 });
  expect(
    sceneTransitionFor(2, "wipe", { previousFrames: 90, frames: 90 }),
  ).toStrictEqual({ transition: "wipe", transitionFrames: 15 });
});
