import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  readCredentialRepo,
  readProfile,
  readProposedFix,
} from "./stored-records.ts";

Deno.test("readProposedFix reads the approved file and code", () => {
  assertEquals(readProposedFix({ file_path: "src/a.ts", new_code: "x" }), {
    filePath: "src/a.ts",
    newCode: "x",
  });
  assertEquals(readProposedFix({ file_path: "a.json", new_code: 1 }), {
    filePath: "a.json",
    newCode: "1",
  });
});

Deno.test("readProposedFix rejects missing details", () => {
  for (const raw of [
    null,
    "x",
    {},
    { file_path: "a.ts" },
    { file_path: "", new_code: "x" },
  ]) {
    assertStrictEquals(readProposedFix(raw), null);
  }
});

Deno.test("readCredentialRepo reads a non-empty repo string", () => {
  assertStrictEquals(readCredentialRepo({ repo: "org/app" }), "org/app");
  assertStrictEquals(readCredentialRepo({ repo: "" }), undefined);
  assertStrictEquals(readCredentialRepo({ repo: 5 }), undefined);
  assertStrictEquals(readCredentialRepo(null), undefined);
});

Deno.test("readProfile defaults a missing name and email", () => {
  assertEquals(readProfile({ display_name: "Dana", email: "d@x.io" }), {
    display_name: "Dana",
    email: "d@x.io",
  });
  assertEquals(readProfile(null), { display_name: "Unknown", email: "" });
  assertEquals(readProfile({ display_name: "" }), {
    display_name: "Unknown",
    email: "",
  });
});
