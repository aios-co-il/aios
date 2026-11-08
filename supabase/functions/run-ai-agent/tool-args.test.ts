import { describe, it } from "jsr:@std/testing@1/bdd";
import { assertEquals, assertStrictEquals, assertThrows } from "jsr:@std/assert@1";
import { argBoolean,argEnum,argNullableNumber,argNullableString,argNumber,argObject,argString,argStringArray,requireArgString } from "./tool-args.ts";
describe("tool argument readers",()=>{
const toolArgs = {
  id: "c1",
  count: 7,
  quoted: " 12 ",
  blank: "",
  word: "abc",
  flag: true,
  cleared: null,
  tags: ["a", 2, "b"],
  nested: { k: 1 },
  list: [1],
};

it(
  "tool args read strings and numbers the way the old coercions did",
  () => {
    assertStrictEquals(argString(toolArgs, "id"), "c1");
    assertStrictEquals(argString(toolArgs, "count"), "7");
    assertStrictEquals(argString(toolArgs, "flag"), undefined);
    assertStrictEquals(argString(toolArgs, "missing"), undefined);
    assertStrictEquals(requireArgString(toolArgs, "blank"), "");
    assertThrows(
      () => requireArgString(toolArgs, "nested"),
      Error,
      "nested is required",
    );
    assertStrictEquals(argNumber(toolArgs, "count"), 7);
    assertStrictEquals(argNumber(toolArgs, "quoted"), 12);
    assertStrictEquals(argNumber(toolArgs, "blank"), undefined);
    assertStrictEquals(argNumber(toolArgs, "word"), undefined);
    assertStrictEquals(argNullableString(toolArgs, "cleared"), null);
    assertStrictEquals(argNullableNumber(toolArgs, "cleared"), null);
    assertStrictEquals(argNullableString(toolArgs, "missing"), undefined);
  },
);

it("tool args narrow arrays, objects and enums", () => {
  assertEquals(argStringArray(toolArgs, "tags"), ["a", "b"]);
  assertStrictEquals(argStringArray(toolArgs, "id"), undefined);
  assertEquals(argObject(toolArgs, "nested"), { k: 1 });
  assertStrictEquals(argObject(toolArgs, "list"), undefined);
  assertStrictEquals(argObject(toolArgs, "cleared"), undefined);
  const statuses = ["open", "done"] as const;
  assertStrictEquals(argEnum({ s: "done" }, "s", statuses), "done");
  assertStrictEquals(argEnum({ s: "" }, "s", statuses), undefined);
  assertStrictEquals(argEnum({}, "s", statuses), undefined);
  assertThrows(() => argEnum({ s: "x" }, "s", statuses), Error, "open, done");
});

it(
  "argBoolean accepts booleans and quoted booleans and rejects other values",
  () => {
    assertStrictEquals(argBoolean({ on: true }, "on"), true);
    assertStrictEquals(argBoolean({ on: false }, "on"), false);
    assertStrictEquals(argBoolean({ on: "true" }, "on"), true);
    assertStrictEquals(argBoolean({ on: "false" }, "on"), false);
    assertStrictEquals(argBoolean({}, "on"), undefined);
    assertThrows(
      () => argBoolean({ on: "yes" }, "on"),
      Error,
      "on must be boolean",
    );
    assertThrows(
      () => argBoolean({ on: 1 }, "on"),
      Error,
      "on must be boolean",
    );
    assertThrows(
      () => argBoolean({ on: null }, "on"),
      Error,
      "on must be boolean",
    );
  },
);

});
