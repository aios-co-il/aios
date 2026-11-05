import { expect, test } from "vitest";
import {
  hebrewTextAlign,
  hebrewTextDir,
  hebrewTextStyle,
  overlayBoxDir,
  overlayBoxStyle,
  overlayFlexJustify,
} from "./rtlText.ts";

test("Hebrew copy never uses auto direction", () => {
  expect(hebrewTextDir).toBe("rtl");
  expect(overlayBoxDir).toBe("ltr");
  expect(hebrewTextDir).not.toBe("auto");
});

test("default alignment is right and isolates bidi", () => {
  expect(hebrewTextAlign(undefined)).toBe("right");
  expect(overlayFlexJustify(undefined)).toBe("flex-end");
  const style = hebrewTextStyle();
  expect(style.direction).toBe("rtl");
  expect(style.unicodeBidi).toBe("isolate");
  expect(style.textAlign).toBe("right");
});

test("center and left stay available without flipping the box into RTL", () => {
  expect(overlayFlexJustify("center")).toBe("center");
  expect(overlayFlexJustify("left")).toBe("flex-start");
  const box = overlayBoxStyle("center");
  expect(box.direction).toBe("ltr");
  expect(box.justifyContent).toBe("center");
});
