import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  readGraphAdAccountsPage,
  readMetaLeadQuestionInput,
} from "./tool-contracts-marketing.ts";
Deno.test(
  "Meta questions preserve optional labels and reject non-string fields",
  () => {
    assertEquals(readMetaLeadQuestionInput({ type: "EMAIL", label: null }), {
      type: "EMAIL",
      label: null,
    });
    assertEquals(
      readMetaLeadQuestionInput({ type: "custom", label: "Budget", x: 1 }),
      { type: "custom", label: "Budget" },
    );
    assertEquals(readMetaLeadQuestionInput({ type: "EMAIL" }), {
      type: "EMAIL",
    });
    for (const value of [
      null,
      [],
      "EMAIL",
      { type: 7 },
      { type: "EMAIL", label: {} },
    ]) {
      assertThrows(() => readMetaLeadQuestionInput(value));
    }
  },
);
Deno.test("Graph accounts retain valid paging and API errors", () => {
  assertEquals(
    readGraphAdAccountsPage({
      data: [{ id: "act_1", name: null, x: 1 }],
      paging: { next: "https://graph.facebook.com/next" },
    }),
    {
      data: [{ id: "act_1", name: null }],
      paging: { next: "https://graph.facebook.com/next" },
    },
  );
  assertEquals(
    readGraphAdAccountsPage({ error: { message: "bad token", code: 190 } })
      .error,
    { message: "bad token" },
  );
  assertEquals(readGraphAdAccountsPage({ data: [] }).data, []);
});
Deno.test(
  "Malformed Graph pages cannot appear as successful empty results",
  () => {
    for (const value of [
      null,
      [],
      {},
      { data: null },
      { data: "x" },
      { data: [null] },
      { data: [{ id: 2 }] },
      { data: [{ id: "" }] },
      { data: [], paging: { next: 5 } },
      { error: "boom" },
    ]) {
      assertThrows(() => readGraphAdAccountsPage(value));
    }
  },
);
