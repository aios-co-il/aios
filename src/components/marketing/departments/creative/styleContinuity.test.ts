import { expect, test } from "vitest";
import {
  buildStyleContinuityLock,
  buildStylePlayLock,
  isTypePlate,
  missingCopyBlocks,
  usesIntegratedType,
} from "./styleContinuity.ts";

test("missingCopyBlocks skips the approved card and existing live keys", () => {
  const blocks = [
    { key: "1", index: 1, label: "וריאציה 1", text: "א", parts: {} },
    { key: "2", index: 2, label: "וריאציה 2", text: "ב", parts: {} },
    { key: "3", index: 3, label: "וריאציה 3", text: "ג", parts: {} },
  ];
  const missing = missingCopyBlocks(
    blocks,
    [
      {
        id: "a",
        name: "1",
        imageUrl: "",
        format: "1:1",
        layers: [],
        comments: [],
        createdAt: "",
        copyKey: "1",
      },
      {
        id: "b",
        name: "2",
        imageUrl: "",
        format: "1:1",
        layers: [],
        comments: [],
        createdAt: "",
        copyKey: "2",
        rejected: true,
      },
    ],
    { id: "a", copyKey: "1" },
  );
  expect(missing.map((block) => block.key)).toStrictEqual(["2", "3"]);
});

test("integrated type means no caption plate under the lockup", () => {
  expect(
    isTypePlate({
      id: "1",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 22,
      fill: "#fff",
    }),
  ).toBe(true);
  expect(
    isTypePlate({
      id: "2",
      type: "shape",
      x: 70,
      y: 40,
      width: 16,
      height: 1.1,
      fill: "#f00",
    }),
  ).toBe(false);
  expect(
    usesIntegratedType({
      compositionId: "flush",
      layers: [
        {
          id: "1",
          type: "text",
          x: 6,
          y: 8,
          width: 80,
          height: 20,
          text: "הלקוח מחפש המלצה",
        },
      ],
    }),
  ).toBe(true);
  expect(
    usesIntegratedType({
      compositionId: "rail",
      layers: [
        {
          id: "1",
          type: "shape",
          x: 68,
          y: 0,
          width: 32,
          height: 100,
          fill: "#111",
        },
      ],
    }),
  ).toBe(false);
});

test("style continuity lock keeps the campaign look and changes the copy beat", () => {
  const lock = buildStyleContinuityLock({
    sourceLabel: "וריאציה 3 · מגולל לצ'אט",
    sourceIdea: "עדיין מגלגל בטיקטוק?",
  });
  expect(lock).toMatch(/CAMPAIGN STYLE LOCK/i);
  expect(lock).toMatch(/מגולל לצ'אט/);
  expect(lock).toMatch(/Technique sample/);
  expect(lock).toMatch(/STYLE ≠ CLONE/);
  expect(lock).toMatch(/new people/);
  expect(lock).toMatch(/No caption plates/i);
  expect(lock).toMatch(/approved still/i);
});

test("style continuity without an attached still does not ask the model to copy a picture", () => {
  const lock = buildStyleContinuityLock({
    sourceLabel: "קולאז'",
    sourceIdea: "עדיין מגלגל בטיקטוק?",
    attachStill: false,
  });
  expect(lock).toMatch(/No still is attached/i);
  expect(lock).not.toMatch(/approved still is attached/i);
});

test("style play lock gives each copy a different cast, crop, and marks", () => {
  const a = buildStylePlayLock({
    copyText: "עדיין מגלגל בטיקטוק?",
    copyKey: "1",
    copyLabel: "מגולל",
  });
  const b = buildStylePlayLock({
    copyText: "המתחרים כבר שם",
    copyKey: "2",
    copyLabel: "פומו",
    avoidLabels: ["מגולל"],
  });
  expect(a).toMatch(/STYLE PLAY/);
  expect(a).toMatch(/not a photocopy/i);
  expect(a).toMatch(/unique staging/);
  expect(b).toMatch(/Do not echo these earlier cards: מגולל/);
  expect(a).not.toBe(b);
});
