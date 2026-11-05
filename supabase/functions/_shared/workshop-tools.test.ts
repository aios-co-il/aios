import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { isWorkshopTool, WORKSHOP_TOOLS } from "./workshop-tools.ts";

Deno.test("every workshop tool is declared once and recognised", () => {
  const names = WORKSHOP_TOOLS.map((tool) => tool.name);
  assertStrictEquals(new Set(names).size, names.length);
  assert(names.every(isWorkshopTool));
  assertStrictEquals(isWorkshopTool("create_lead"), false);
});
