import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  formatSignatureDateValue,
  signatureFieldTextLayout,
} from "./signature-field-text.ts";

Deno.test("signature dates print as day/month/year", () => {
  assertStrictEquals(formatSignatureDateValue("2026-09-24"), "24/09/2026");
  assertStrictEquals(formatSignatureDateValue("24/09/2026"), "24/09/2026");
});

Deno.test("field text starts at the right edge of the box", () => {
  const layout = signatureFieldTextLayout(200, 40);
  assertStrictEquals(layout.textAnchor, "end");
  assertStrictEquals(layout.direction, "rtl");
  assertStrictEquals(layout.x, 196);
});

Deno.test("optional left align stays at the start of the box", () => {
  const layout = signatureFieldTextLayout(200, 40, "left");
  assertStrictEquals(layout.textAnchor, "start");
  assertStrictEquals(layout.direction, "ltr");
  assertStrictEquals(layout.x, 4);
});
