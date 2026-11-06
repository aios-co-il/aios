import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { briefAnswersOf } from "./brief-answers.ts";
import type { Db } from "./db.ts";
import { APPROVE_STILLS, STILLS_QUESTION } from "./tools/stills-approval.ts";
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

describe("saveTurnAnswers: a tapped approval of the pictures", () => {
  const asked = {
    project_type: "video",
    video: { asked_stills: ["a", "b"], asked_stills_turn: "turn-1" },
  };
  const save = (lastAssistant: string, userText: string, turnId = "turn-2") =>
    saveTurnAnswers(recordingDb().db, "tenant-1", "item-1", asked, {
      userText,
      lastAssistant,
      turnId,
    });
  const video = (payload: Record<string, unknown>) =>
    payload.video as Record<string, unknown>;

  // Staging, 5 Nov: the user tapped "התמונות מאושרות", Carmen chose the voice in that turn instead
  // of producing, and the next turn asked about the pictures again.
  it("keeps the pictures' approval when the user taps it, whatever Carmen calls next", async () => {
    const saved = await save(STILLS_QUESTION, APPROVE_STILLS);
    assertEquals(video(saved.payload).approved_stills, ["a", "b"]);
    assertMatch(saved.lines.join("\n"), /אישר עכשיו את תמונות הסצנות/);
  });

  it("keeps nothing on לתקן, in the turn it was asked, or without the question", async () => {
    for (const saved of [
      await save(STILLS_QUESTION, "לתקן"),
      await save(STILLS_QUESTION, APPROVE_STILLS, "turn-1"),
      await save("הנה התמונות.", APPROVE_STILLS),
    ]) {
      assertStrictEquals(video(saved.payload).approved_stills, undefined);
    }
  });
});
