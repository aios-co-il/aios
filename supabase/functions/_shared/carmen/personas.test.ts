import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  BUILTIN_PERSONAS,
  callWordProblem,
  callWordsOf,
  orgStylePersonaKey,
  parseOrgStyle,
  usableCallWords,
} from "./personas.ts";

describe("callWordProblem", () => {
  it("refuses greetings and everyday words that would wake the agent in any chat", () => {
    for (const word of ["היי", "שלום", " Hey ", "תודה", "בוקר טוב"]) {
      assertNotEquals(callWordProblem(word), null, word);
    }
  });

  it("refuses words under three letters", () => {
    assertNotEquals(callWordProblem("מי"), null);
    assertNotEquals(callWordProblem("a1"), null);
  });

  it("accepts a real name", () => {
    assertEquals(callWordProblem("מיני מי"), null);
    assertEquals(callWordProblem("AIOS"), null);
    assertEquals(callWordProblem("ג׳ארוויס"), null);
  });
});

describe("usableCallWords", () => {
  it("drops refused words and keeps the rest", () => {
    assertEquals(usableCallWords(["היי", "מיני מי", "מי"]), ["מיני מי"]);
  });
});

describe("parseOrgStyle", () => {
  it("reads a stored style", () => {
    assertEquals(parseOrgStyle({ style: "character" }), "character");
    assertEquals(parseOrgStyle({ style: "orbs" }), "orbs");
    assertEquals(parseOrgStyle({ style: "minime" }), "minime");
  });

  it("falls back to the orbs when nothing valid is stored", () => {
    assertEquals(parseOrgStyle(null), "orbs");
    assertEquals(parseOrgStyle({ style: "hologram" }), "orbs");
    assertEquals(parseOrgStyle("character"), "orbs");
  });
});

describe("orgStylePersonaKey", () => {
  it("makes the organization's Carmen the Mini Me only for the Mini Me style", () => {
    assertEquals(orgStylePersonaKey("minime"), "minime");
    assertEquals(orgStylePersonaKey("orbs"), null);
    assertEquals(orgStylePersonaKey("character"), null);
  });
});

describe("callWordsOf", () => {
  it("gives the character's call words, lowercased", () => {
    assertEquals(callWordsOf(BUILTIN_PERSONAS.aios), ["aios", "איוס"]);
  });

  it("is empty without a character", () => {
    assertEquals(callWordsOf(null), []);
  });
});
