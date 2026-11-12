import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { callWordProblem, usableCallWords } from "./personas.ts";

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
