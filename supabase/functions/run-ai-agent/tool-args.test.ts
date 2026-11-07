import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  argBoolean,
  argEnum,
  argNullableNumber,
  argNullableString,
  argNumber,
  argObject,
  argString,
  argStringArray,
  requireArgString,
} from "./tool-args.ts";

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

Deno.test(
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
    assertStrictEquals(argNumber(toolArgs, "flag"), undefined);
    assertStrictEquals(argNullableString(toolArgs, "cleared"), null);
    assertStrictEquals(argNullableString(toolArgs, "count"), "7");
    assertStrictEquals(argNullableNumber(toolArgs, "cleared"), null);
    assertStrictEquals(argNullableNumber(toolArgs, "quoted"), 12);
    assertStrictEquals(argNullableString(toolArgs, "missing"), undefined);
    assertStrictEquals(argNullableString(toolArgs, "nested"), undefined);
  },
);

Deno.test("tool args narrow arrays, objects and enums", () => {
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
  assertThrows(() => argEnum({ s: 3 }, "s", statuses), Error, "open, done");
});

Deno.test(
  "argBoolean accepts booleans and quoted booleans and rejects other values",
  () => {
    assertStrictEquals(argBoolean({ on: true }, "on"), true);
    assertStrictEquals(argBoolean({ on: false }, "on"), false);
    assertStrictEquals(argBoolean({ on: "true" }, "on"), true);
    assertStrictEquals(argBoolean({ on: "false" }, "on"), false);
    assertStrictEquals(argBoolean({}, "on"), undefined);
    for (const on of ["yes", 1, null]) {
      assertThrows(() => argBoolean({ on }, "on"), Error, "on must be boolean");
    }
  },
);
