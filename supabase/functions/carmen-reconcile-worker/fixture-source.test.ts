import { assertThrows } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { createFixtureSource } from "./fixture-source.ts";

describe("createFixtureSource", () => {
  it("exists only outside production", () => {
    assertThrows(() => createFixtureSource({}, undefined));
    assertThrows(() => createFixtureSource({}, "production"));
    createFixtureSource({}, "staging");
    createFixtureSource({}, "development");
  });
});
