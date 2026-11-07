import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  readGraphAdAccountsPage,
  readMetaLeadQuestionInput,
} from "./tool-contracts-marketing.ts";

Deno.test("Meta lead form question input keeps type and label only", () => {
  const question = readMetaLeadQuestionInput({
    type: "custom",
    label: "Budget",
    x: 1,
  });
  assertEquals(question, { type: "custom", label: "Budget" });
  assertStrictEquals(readMetaLeadQuestionInput({ type: 7 }).type, 7);
  assertStrictEquals(
    readMetaLeadQuestionInput({ type: "EMAIL" }).label,
    undefined,
  );
});

Deno.test(
  "Meta lead form question input outside an object reads as empty",
  () => {
    for (const value of ["EMAIL", null, undefined, 3, ["EMAIL"]]) {
      assertEquals(readMetaLeadQuestionInput(value), {});
    }
  },
);

Deno.test("Graph ad account pages pass accounts and paging through", () => {
  const page = readGraphAdAccountsPage({
    data: [
      { id: "act_1", name: "Main", account_status: 1, currency: "ILS", x: 1 },
      { id: 2, name: null },
      "odd",
    ],
    paging: { next: "https://graph.facebook.com/next" },
  });
  assertEquals(page.data, [
    { id: "act_1", name: "Main", account_status: 1, currency: "ILS" },
    { id: 2, name: null },
    {},
  ]);
  assertStrictEquals(page.paging?.next, "https://graph.facebook.com/next");
  assertStrictEquals(page.error, undefined);
});

Deno.test("Graph ad account errors surface even when malformed", () => {
  assertEquals(
    readGraphAdAccountsPage({ error: { message: "bad token", code: 190 } })
      .error,
    { message: "bad token" },
  );
  assertEquals(readGraphAdAccountsPage({ error: "boom" }).error, {
    message: undefined,
  });
});

Deno.test(
  "malformed Graph ad account pages end paging without accounts",
  () => {
    for (const value of [null, "x", [], { data: "x", paging: { next: 5 } }]) {
      const page = readGraphAdAccountsPage(value);
      assertStrictEquals(page.data ?? null, null);
      assertStrictEquals(page.paging?.next ?? null, null);
    }
  },
);
