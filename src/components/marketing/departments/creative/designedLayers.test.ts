import { expect, test } from "vitest";
import {
  buildCampaignVisualBrief,
  buildCopyOverlayLock,
  buildCopySceneBrief,
  buildDesignedCopyLayers,
  buildPaintedCopyLock,
  ensureLogoLayer,
  extractCopyAngle,
  heroWord,
  isInternalCopyLine,
  isLegacyHeadlineBand,
  parseCreativeCopy,
  punchScore,
  shouldRebuildDesignedLayers,
  strongestLine,
  wrapPosterLine,
  hydrateVariationLayers,
} from "./designedLayers.ts";

const AIDA_DOC = `
וריאציה 1 — AIDA — פומו תחרותי
כותרת:
טסים לרודוס
גוף:
רק 99 ש״ח ללילה, כולל טיסה
CTA:
להזמנה
רציונל: בודקים FOMO מול מחיר. רפרנס: Smartair — destination as hero.
`;

test("skips Copy-department AIDA headers and labels", () => {
  expect(isInternalCopyLine("וריאציה 1 — AIDA — פומו תחרותי")).toBe(true);
  expect(isInternalCopyLine("כותרת:")).toBe(true);
  expect(isInternalCopyLine("CTA:")).toBe(true);
  expect(isInternalCopyLine("טסים לרודוס")).toBe(false);
});

test("parseCreativeCopy reads the line after כותרת, not the variation title", () => {
  const parts = parseCreativeCopy(AIDA_DOC, "וריאציה 1 — AIDA — פומו תחרותי");
  expect(parts.headline).toBe("טסים לרודוס");
  expect(parts.body).toBe("רק 99 ש״ח ללילה, כולל טיסה");
  expect(parts.cta).toBe("להזמנה");
  expect(parts.headline).not.toBe("וריאציה 1 — AIDA — פומו תחרותי");
});

test("parseCreativeCopy never falls back to an AIDA project title", () => {
  const parts = parseCreativeCopy("כותרת:\n\nגוף:\n", "וריאציה 2 — PAS — כאב");
  expect(parts.headline).toBe(undefined);
});

test("parseCreativeCopy supports inline labels", () => {
  const parts = parseCreativeCopy(
    "כותרת: רודוס\nהצעה: 99₪ ללילה\nCTA: הזמינו עכשיו",
  );
  expect(parts.headline).toBe("רודוס");
  expect(parts.offer).toBe("99₪ ללילה");
  expect(parts.cta).toBe("הזמינו עכשיו");
});

test("heroWord keeps a short destination and picks a punchy token from a long line", () => {
  expect(heroWord("רודוס")).toBe("רודוס");
  expect(heroWord("טסים לרודוס עכשיו במחיר מטורף")).toBe("טסים");
});

test("visual brief uses real offer copy, never the AIDA header", () => {
  const brief = buildCampaignVisualBrief({
    copyText: AIDA_DOC,
    title: "וריאציה 1 — AIDA — פומו תחרותי",
    brief: "טיסה לרודוס במחיר מבצע",
  });
  expect(brief).toMatch(/רודוס/);
  expect(brief).not.toMatch(/AIDA/);
  expect(brief).not.toMatch(/וריאציה 1/);
  expect(brief).not.toMatch(/פומו תחרותי/);
});

test("extractCopyAngle reads the variation idea from em-dash or bullet labels", () => {
  expect(extractCopyAngle(AIDA_DOC)).toBe("פומו תחרותי");
  expect(extractCopyAngle(undefined, "וריאציה 3 • מגולל לצ'אט")).toBe(
    "מגולל לצ'אט",
  );
  expect(extractCopyAngle("כותרת: רודוס", "פומו תחרותי")).toBe("פומו תחרותי");
  expect(extractCopyAngle(`וריאציה 2 — בעיית "אני לא יודע אם אני שם"`)).toBe(
    `בעיית "אני לא יודע אם אני שם"`,
  );
});

test("copy overlay lock keeps the concept in charge of the photograph", () => {
  const lock = buildCopyOverlayLock({
    title: "seo / geo",
    copyLabel: "וריאציה 1",
    copyText: `כותרת: עדיין מגלגל בטיקטוק?
גוף: תפתח צ'אט. נסגור לך טיסה.`,
  });
  expect(lock).toMatch(/COPY IS OVERLAY ONLY/);
  expect(lock).toMatch(/Do not invent a new subject from the slogan/);
  expect(lock).toMatch(/טיקטוק/);
  expect(lock).not.toMatch(/STAGE THIS IDEA/);
});

test("painted copy lock quotes headline and CTA for a finished ad", () => {
  const lock = buildPaintedCopyLock({
    title: "פרומו",
    copyLabel: "וריאציה 1",
    copyText: `כותרת: המתחרים שלך כבר נכנסים לתשובות של הצ׳אט?
CTA: השאירו פרטים לבדיקת הנוכחות שלכם בצ׳אט`,
  });
  expect(lock).toMatch(/FINISHED AD/);
  expect(lock).toMatch(/המתחרים שלך/);
  expect(lock).toMatch(/השאירו פרטים/);
  expect(lock).toMatch(/right-to-left/i);
  expect(lock).not.toMatch(/COPY IS OVERLAY ONLY/);
  expect(lock).not.toMatch(/TYPE ONLY/);
});

test("concept-locked painted copy is type on the photograph, not a new scene", () => {
  const lock = buildPaintedCopyLock({
    title: "פרומו",
    copyLabel: "וריאציה 1",
    conceptLocked: true,
    copyText: `כותרת: המתחרים שלך כבר נכנסים לתשובות של הצ׳אט?
CTA: השאירו פרטים לבדיקת הנוכחות שלכם בצ׳אט`,
  });
  expect(lock).toMatch(/TYPE ONLY/);
  expect(lock).toMatch(/not a new scene/);
  expect(lock).toMatch(/המתחרים שלך/);
  expect(lock).not.toMatch(/STAGE THIS IDEA/);
});

test("paintCopy scene brief stages the idea and then paints type", () => {
  const scene = buildCopySceneBrief({
    title: "פרומו",
    copyText: "כותרת: המתחרים שלך כבר נכנסים לתשובות של הצ׳אט?",
    paintCopy: true,
  });
  expect(scene).toMatch(/NO APPROVED CONCEPT/);
  expect(scene).toMatch(/STAGE THIS IDEA/);
  expect(scene).toMatch(/paint the quoted Hebrew/i);
  expect(scene).not.toMatch(/NEVER draw these characters/);
});

test("copy scene brief stages chat-scroll copy, not a style postcard", () => {
  const scene = buildCopySceneBrief({
    title: "Smartair",
    brief: "טיסה ישירה לרודוס",
    copyLabel: "וריאציה 3 • מגולל לצ'אט",
    copyText: `וריאציה 3 — מגולל לצ'אט

כותרת: עדיין מגלגל בטיקטוק?

גוף: תפתח צ'אט. נסגור לך טיסה בלי עוד שעה של סרטונים.

הנעה לפעולה: כתבו "רודוס" בוואטסאפ`,
  });
  expect(scene).toMatch(/STAGE THIS IDEA/);
  expect(scene).toMatch(/NEVER draw these characters/);
  expect(scene).toMatch(/מגולל לצ'אט/);
  expect(scene).toMatch(/צ'אט/);
  expect(scene).toMatch(/FORBIDDEN SUBSTITUTION/i);
  expect(scene).toMatch(/vacation postcard|Santorini|airplane wing/i);
});

test("copy scene brief stages the doubt problem, not a sea arch", () => {
  const scene = buildCopySceneBrief({
    title: "Smartair",
    brief: "טיסה ישירה לרודוס",
    copyText: `וריאציה 2 — בעיית "אני לא יודע אם אני שם"

כותרת: אתה עדיין לא יודע אם אתה שם?

גוף: בזמן שאתה מתלבט, הטיסות נסגרות.

הנעה לפעולה: בדוק זמינות`,
  });
  expect(scene).toMatch(/אני לא יודע אם אני שם/);
  expect(scene).toMatch(/מתלבט/);
  expect(scene).toMatch(/Santorini|sea arch/i);
});

test("copy scene brief stages competitive FOMO, not an airplane wing", () => {
  const scene = buildCopySceneBrief({
    title: "Smartair Rhodes",
    brief: "טיסה לרודוס במחיר מבצע",
    copyLabel: "וריאציה 1 • פומו תחרותי",
    copyText: AIDA_DOC,
  });
  expect(scene).toMatch(/פומו תחרותי/);
  expect(scene).toMatch(/רודוס|99/);
  expect(scene).toMatch(/THIS variation/i);
  expect(scene).not.toMatch(/\bAIDA\b/);
});

test("strongestLine prefers a punchy sentence over a weak one-word headline", () => {
  expect(strongestLine(AIDA_DOC)).toBe("רק 99 ש״ח ללילה, כולל טיסה");
  expect(
    strongestLine(
      "כותרת:\nהמתחרים\nגוף:\nלקוחות כבר לא מחפשים רק בגוגל\nCTA:\nהשאירו פרטים",
    ),
  ).toBe("לקוחות כבר לא מחפשים רק בגוגל");
  expect(punchScore("רק 99 ש״ח ללילה") > punchScore("המתחרים")).toBeTruthy();
});

test("wrapPosterLine splits a long lockup into two poster lines", () => {
  expect(wrapPosterLine("רודוס", 14)).toBe("רודוס");
  const wrapped = wrapPosterLine("לקוחות כבר לא מחפשים רק בגוגל", 13);
  expect(wrapped).toMatch(/\n/);
  expect(wrapped.split("\n").length).toBe(2);
});

test("flush lockup is fat type without a full-width headline rectangle", () => {
  const layers = buildDesignedCopyLayers({
    copyText:
      "כותרת:\nהמתחרים\nגוף:\nלקוחות כבר לא מחפשים רק בגוגל\nCTA:\nהשאירו פרטים",
    format: "1:1",
    styleId: "cinematic",
    compositionId: "flush",
  });
  const poster = layers.find(
    (layer) => layer.type === "text" && (layer.text ?? "").includes("לקוחות"),
  );
  expect(poster).toBeTruthy();
  expect(poster?.fontFamily).toBe("Suez One");
  expect((poster?.fontSize ?? 0) >= 32).toBeTruthy();
  expect(!layers.some((layer) => layer.text === "המתחרים")).toBeTruthy();
  expect(!layers.some((layer) => isLegacyHeadlineBand(layer))).toBeTruthy();
  expect(poster?.shadowStyle).toBe("halo");
  const cta = layers.find((layer) => layer.text === "השאירו פרטים");
  expect(cta).toBeTruthy();
  expect(
    layers.some(
      (layer) =>
        layer.type === "shape" &&
        (layer.y ?? 0) >= 80 &&
        (layer.width ?? 0) >= 50,
    ),
  ).toBe(false);
});

// FIXME: failing before the Vitest migration (was never run in CI); fix or delete.
test.skip("offer board is a lead-gen template with footer, icons, and brand CTA", () => {
  const layers = buildDesignedCopyLayers({
    copyText: `כותרת: הלקוח מחפש המלצה ב־AI
- חיפוש חכם
- בדיקת אתר
- ליווי
CTA: השאירו פרטים`,
    format: "1:1",
    styleId: "swiss",
    compositionId: "offer",
    brandColors: ["#111111", "#e11d48"],
    logoUrl: "https://example.com/logo.png",
  });
  expect(layers.some((layer) => layer.role === "type_field")).toBeTruthy();
  expect(layers.some((layer) => layer.role === "footer")).toBeTruthy();
  expect(
    layers.some((layer) => layer.role === "icon" && layer.icon),
  ).toBeTruthy();
  expect(
    layers.some(
      (layer) => layer.role === "cta_fill" && layer.fill === "#e11d48",
    ),
  ).toBeTruthy();
  expect(
    layers.some(
      (layer) => layer.role === "cta" && layer.text === "השאירו פרטים",
    ),
  ).toBeTruthy();
  expect(
    shouldRebuildDesignedLayers(layers, "כותרת: הלקוח מחפש המלצה ב־AI"),
  ).toBe(false);
});

test("designed layers never paint AIDA labels or a bottom caption plate", () => {
  const layers = buildDesignedCopyLayers({
    copyText: AIDA_DOC,
    format: "1:1",
    styleId: "photoreal",
    title: "וריאציה 1 — AIDA — פומו תחרותי",
    compositionId: "flush",
  });
  const texts = layers.map((layer) => layer.text).filter(Boolean);
  expect(texts.some((text) => (text ?? "").includes("99"))).toBeTruthy();
  expect(!texts.includes("טסים")).toBeTruthy();
  expect(texts.includes("להזמנה")).toBeTruthy();
  expect(
    !texts.some((text) => /AIDA|וריאציה|כותרת:/.test(text ?? "")),
  ).toBeTruthy();
  expect(
    !layers.some(
      (layer) =>
        layer.type === "shape" &&
        layer.y >= 58 &&
        layer.height >= 18 &&
        layer.height <= 36 &&
        layer.width >= 70,
    ),
  ).toBeTruthy();
});

test("designed layers no longer overlay a logo watermark", () => {
  const layers = buildDesignedCopyLayers({
    copyText: "כותרת:\nרודוס\nCTA:\nלהזמנה",
    format: "1:1",
    styleId: "swiss",
    logoUrl: "https://example.com/logo.png",
    compositionId: "flag",
  });
  expect(
    layers.some((layer) => layer.type === "image" || layer.role === "logo"),
  ).toBe(false);
  expect(layers.some((layer) => layer.text === "רודוס")).toBeTruthy();
});

test("ensureLogoLayer updates or removes the logo without touching copy", () => {
  const withLogo = ensureLogoLayer(
    [
      {
        id: "1",
        type: "text",
        x: 8,
        y: 8,
        width: 60,
        height: 10,
        text: "רודוס",
      },
    ],
    "https://example.com/a.png",
  );
  expect(withLogo.filter((layer) => layer.type === "image").length).toBe(1);
  const updated = ensureLogoLayer(withLogo, "https://example.com/b.png");
  expect(updated.find((layer) => layer.type === "image")?.src).toBe(
    "https://example.com/b.png",
  );
  expect(updated.find((layer) => layer.text === "רודוס")?.text).toBe("רודוס");
  expect(ensureLogoLayer(updated).some((layer) => layer.type === "image")).toBe(
    false,
  );
});

test("shouldRebuildDesignedLayers catches leftover AIDA overlays and weak auto type", () => {
  expect(
    shouldRebuildDesignedLayers([
      {
        id: "1",
        type: "text",
        x: 8,
        y: 60,
        width: 84,
        height: 16,
        text: "וריאציה 1 — AIDA — פומו תחרותי",
      },
    ]),
  ).toBe(true);
  expect(
    shouldRebuildDesignedLayers([
      {
        id: "1",
        type: "shape",
        x: 4,
        y: 62,
        width: 92,
        height: 28,
        fill: "#ffffffcc",
      },
    ]),
  ).toBe(true);
  expect(
    shouldRebuildDesignedLayers([
      {
        id: "1",
        type: "text",
        x: 8,
        y: 30,
        width: 80,
        height: 14,
        text: "רודוס",
      },
    ]),
  ).toBe(false);
  expect(
    shouldRebuildDesignedLayers(
      [
        {
          id: "1",
          type: "text",
          x: 6,
          y: 5,
          width: 80,
          height: 10,
          text: "טסים",
          fontFamily: "Rubik",
          fontSize: 28,
        },
      ],
      AIDA_DOC,
    ),
  ).toBe(true);
  expect(
    shouldRebuildDesignedLayers(
      [
        {
          id: "1",
          type: "text",
          x: 4,
          y: 4,
          width: 90,
          height: 16,
          text: "טסים לרודוס",
          fontFamily: "Suez One",
          fontSize: 52,
        },
      ],
      AIDA_DOC,
    ),
  ).toBe(false);
  expect(
    shouldRebuildDesignedLayers(
      [
        {
          id: "1",
          type: "shape",
          x: 0,
          y: 0,
          width: 100,
          height: 22,
          fill: "#f8fafccc",
        },
        {
          id: "2",
          type: "text",
          x: 4,
          y: 4,
          width: 90,
          height: 16,
          text: "רק 99 ש״ח ללילה, כולל טיסה",
          fontFamily: "Suez One",
          fontSize: 52,
        },
      ],
      AIDA_DOC,
    ),
  ).toBe(true);
});

test("brand colors from the logo override the style palette", () => {
  const layers = buildDesignedCopyLayers({
    copyText: "כותרת:\nרודוס\nCTA:\nלהזמנה",
    format: "1:1",
    styleId: "swiss",
    compositionId: "flush",
    brandColors: ["#111111", "#e11d48"],
  });
  const poster = layers.find((layer) => layer.text === "רודוס");
  expect(
    poster?.color === "#111111" || poster?.color === "#e11d48",
  ).toBeTruthy();
});

test("rail composition is a vertical field, not a top strip", () => {
  const layers = buildDesignedCopyLayers({
    copyText: "כותרת:\nרודוס\nCTA:\nלהזמנה",
    format: "1:1",
    styleId: "bauhaus",
    compositionId: "rail",
  });
  const field = layers.find(
    (layer) => layer.type === "shape" && (layer.height ?? 0) >= 80,
  );
  expect(field).toBeTruthy();
  expect((field?.x ?? 0) >= 60).toBeTruthy();
  expect(!layers.some((layer) => isLegacyHeadlineBand(layer))).toBeTruthy();
  expect(
    shouldRebuildDesignedLayers(layers, "כותרת:\nרודוס\nCTA:\nלהזמנה"),
  ).toBe(false);
});

test("split field is architecture, not a leftover caption plate", () => {
  const layers = buildDesignedCopyLayers({
    copyText: "כותרת:\nרודוס\nCTA:\nלהזמנה",
    format: "1:1",
    styleId: "industrial",
    compositionId: "split",
  });
  const field = layers.find(
    (layer) => layer.type === "shape" && (layer.height ?? 0) >= 40,
  );
  expect(field).toBeTruthy();
  expect((field?.y ?? 0) >= 50).toBeTruthy();
  expect(
    shouldRebuildDesignedLayers(layers, "כותרת:\nרודוס\nCTA:\nלהזמנה"),
  ).toBe(false);
});

test("slash field is rotated instead of a horizontal caption bar", () => {
  const layers = buildDesignedCopyLayers({
    copyText: "כותרת:\nרודוס\nCTA:\nלהזמנה",
    format: "1:1",
    styleId: "kinetic",
    compositionId: "slash",
  });
  const slash = layers.find(
    (layer) => typeof layer.rotation === "number" && layer.rotation < 0,
  );
  expect(slash).toBeTruthy();
  expect(!layers.some((layer) => isLegacyHeadlineBand(layer))).toBeTruthy();
});

test("hydrateVariationLayers does not crash when layers are missing", () => {
  const next = hydrateVariationLayers(
    {
      id: "v1",
      name: "test",
      imageUrl: "https://example.com/x.png",
      format: "1:1",
      layers: undefined as never,
      comments: [],
      createdAt: "",
    },
    "",
  );
  expect(Array.isArray(next.layers)).toBeTruthy();
});

test("hydrateVariationLayers skips live-text rebuild when live text is off", () => {
  const next = hydrateVariationLayers(
    {
      id: "v1",
      name: "test",
      imageUrl: "https://example.com/x.png",
      format: "1:1",
      layers: [
        {
          id: "t1",
          type: "text",
          x: 0,
          y: 0,
          width: 80,
          height: 20,
          text: "כותרת ישנה",
        },
      ],
      comments: [],
      createdAt: "",
    },
    "כותרת: כותרת חדשה לגמרי\nCTA: השאירו פרטים",
    undefined,
    "cinematic",
    undefined,
    undefined,
    false,
  );
  expect(next.layers.some((layer) => layer.text === "כותרת ישנה")).toBe(true);
  expect(next.layers.some((layer) => (layer.text ?? "").includes("חדשה"))).toBe(
    false,
  );
});

test("hydrateVariationLayers strips auto-composited logo watermarks", () => {
  const next = hydrateVariationLayers(
    {
      id: "v1",
      name: "test",
      imageUrl: "https://example.com/x.png",
      format: "1:1",
      layers: [
        {
          id: "t1",
          type: "text",
          x: 0,
          y: 0,
          width: 80,
          height: 20,
          text: "כותרת",
        },
        {
          id: "logo",
          type: "image",
          role: "logo",
          x: 74,
          y: 86,
          width: 20,
          height: 8,
          src: "https://example.com/logo.png",
        },
      ],
      comments: [],
      createdAt: "",
    },
    "כותרת",
    undefined,
    "cinematic",
    "https://example.com/logo.png",
    undefined,
    false,
  );
  expect(
    next.layers.some(
      (layer) => layer.role === "logo" || layer.type === "image",
    ),
  ).toBe(false);
  expect(next.layers.some((layer) => layer.text === "כותרת")).toBe(true);
});
