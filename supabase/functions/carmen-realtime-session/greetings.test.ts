import { assert, assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  CARMEN_GREETER,
  connectedGreetings,
  pickGreeting,
} from "./greetings.ts";

const MINI_ME = { name: "מיני מי", gender: "male" } as const;

describe("pickGreeting", () => {
  it("spreads over every greeting", () => {
    const lines = connectedGreetings(MINI_ME);

    const picked = lines.map((_, i) =>
      pickGreeting(MINI_ME, () => i / lines.length),
    );

    assertEquals(picked, lines);
  });

  it("stays in range at the top edge", () => {
    const lines = connectedGreetings(CARMEN_GREETER);

    assertEquals(
      pickGreeting(CARMEN_GREETER, () => 0.999999),
      lines[lines.length - 1],
    );
  });

  it("is Carmen's when no character is given", () => {
    assertEquals(
      pickGreeting(undefined, () => 0.999999),
      "כן, אני שומעת.",
    );
  });
});

describe("connectedGreetings", () => {
  it("speaks in the masculine for a male character and names it", () => {
    const lines = connectedGreetings(MINI_ME);

    assert(lines.includes("כן, אני שומע."));
    assert(!lines.includes("כן, אני שומעת."));
    assert(lines.includes("מיני מי כאן. מה צריך?"));
  });

  it("keeps Carmen feminine and unnamed", () => {
    const lines = connectedGreetings(CARMEN_GREETER);

    assert(lines.includes("כן, אני שומעת."));
    assert(!lines.includes("כן, אני שומע."));
    assert(lines.every((line) => !line.includes("כרמן")));
  });

  it("names a female character in the feminine", () => {
    const lines = connectedGreetings({ name: "מיני מי", gender: "female" });

    assert(lines.includes("כן, אני שומעת."));
    assert(lines.includes("מיני מי כאן. מה צריך?"));
  });

  it("no greeting falls back to the old generic line", () => {
    for (const character of [CARMEN_GREETER, MINI_ME]) {
      assert(connectedGreetings(character).every((g) => !g.includes("מקשיבה")));
    }
  });
});
