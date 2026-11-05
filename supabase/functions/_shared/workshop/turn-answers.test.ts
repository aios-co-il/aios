import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { briefAnswersOf } from "./brief-answers.ts";
import type { Db } from "./db.ts";
import { saveTurnAnswers } from "./turn-answers.ts";

/** A client that records the project writes and answers every read with nothing. */
function recordingDb() {
  const updates: Array<Record<string, unknown>> = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "match", "order", "limit"]) {
    chain[name] = () => chain;
  }
  chain.update = (value: Record<string, unknown>) => {
    updates.push(value);
    return chain;
  };
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({ data: [], error: null });
  const db: Db = { from: () => chain };
  return { db, updates };
}

describe("saveTurnAnswers", () => {
  it("saves a concept approved on the board and says the script comes next", async () => {
    const { db, updates } = recordingDb();
    // PageActions.tsx sends this line; Carmen's last message asked nothing about concepts.
    const saved = await saveTurnAnswers(
      db,
      "tenant-1",
      "item-1",
      { project_type: "video" },
      {
        userText: "קונספט: יום אחד",
        lastAssistant: "הנה שלושה קונספטים בלוח.",
        turnId: "turn-2",
      },
    );
    assertStrictEquals(briefAnswersOf(saved.payload)["קונספט"], "יום אחד");
    assertStrictEquals(updates.length > 0, true);
    assertMatch(saved.lines.join("\n"), /אישר עכשיו את הקונספט "יום אחד"/);
  });

  it("saves nothing about a concept when the message names none", async () => {
    const { db } = recordingDb();
    const saved = await saveTurnAnswers(
      db,
      "tenant-1",
      "item-1",
      { project_type: "video" },
      { userText: "תעשי את זה מצחיק", lastAssistant: "", turnId: "turn-2" },
    );
    assertStrictEquals(briefAnswersOf(saved.payload)["קונספט"], undefined);
    assertStrictEquals(saved.lines.length, 0);
  });
});
