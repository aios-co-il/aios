import { assertEquals } from "jsr:@std/assert@1";
import type { aiChat } from "../../../_shared/ai.ts";
import { type AskModelDeps, modelAsker } from "./ask-model.ts";

type ChatOptions = Parameters<typeof aiChat>[1];

/** Deps over a scripted chat that records its options. */
function deps(
  answer: Promise<string | null>,
  fields: Partial<AskModelDeps> = {},
) {
  const seen: ChatOptions[] = [];
  const chat: typeof aiChat = (_prompt, options) => {
    seen.push(options);
    options?.onUsage?.({ costUsd: 0.003 });
    return answer;
  };
  return {
    deps: { chat, hasPlatformKey: () => true, timeoutMs: 1_000, ...fields },
    seen,
  };
}

Deno.test("modelAsker", async (t) => {
  await t.step("a metered JSON call under the tenant and source", async () => {
    const { deps: d, seen } = deps(Promise.resolve('{"material":false}'));
    const ask = modelAsker("t1", "manager_round:group_updates", d);
    assertEquals(await ask("p"), {
      text: '{"material":false}',
      costUsd: 0.003,
    });
    assertEquals(
      [seen[0]?.jsonMode, seen[0]?.tenantId, seen[0]?.source],
      [true, "t1", "manager_round:group_updates"],
    );
  });

  await t.step("without the platform key no call is made", async () => {
    const { deps: d, seen } = deps(Promise.resolve("{}"), {
      hasPlatformKey: () => false,
    });
    assertEquals(await modelAsker("t1", "s", d)("p"), {
      text: null,
      costUsd: 0,
    });
    assertEquals(seen, []);
  });

  await t.step("a hung call is given up at the timeout", async () => {
    const hung = new Promise<string | null>(() => {});
    const { deps: d } = deps(hung, { timeoutMs: 5 });
    const answer = await modelAsker("t1", "s", d)("p");
    assertEquals(answer.text, null);
  });
});
