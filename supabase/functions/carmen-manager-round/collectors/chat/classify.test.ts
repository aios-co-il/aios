import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "../../budget.ts";
import { dmRow, review, row, thread } from "../../tests/chat-fixtures.ts";
import { type ClassifyPorts, classifyWaits } from "./classify.ts";
import type { ThreadReview } from "./gate.ts";
import { createLlmMeter } from "./llm-meter.ts";
import type { CachedReview } from "./review-cache.ts";
import type { ChatVerdict } from "./verdict.ts";

const verdict: ChatVerdict = {
  needs_reply: true,
  is_request: true,
  is_complaint: false,
  urgency: "normal",
  summary_he: "מבקש להעלות מבצע",
  confidence: 0.9,
};

function ports(
  fields: {
    cached?: Map<string, CachedReview>;
    dailyCapUsd?: number;
    answer?: string | null;
  } = {},
) {
  const prompts: string[] = [];
  const saved: string[] = [];
  const meter = createLlmMeter({
    monthBudgetUsd: null,
    monthSpentUsd: 0,
    dailyCapUsd: fields.dailyCapUsd ?? 1,
    daySpentUsd: 0,
  });
  const fake: ClassifyPorts = {
    cache: {
      load: () => Promise.resolve(fields.cached ?? new Map()),
      save: (key) => {
        saved.push(key);
        return Promise.resolve();
      },
    },
    ask: (prompt) => {
      prompts.push(prompt);
      const text =
        fields.answer === undefined ? JSON.stringify(verdict) : fields.answer;
      return Promise.resolve({ text, costUsd: 0.002 });
    },
    meter: () => Promise.resolve(meter),
  };
  return { fake, prompts, saved };
}

const run = (dryRun = false) => ({
  budget: RoundBudget.create(60_000, 10),
  dryRun,
});

const group = (): ThreadReview =>
  review(thread([row({ message_id: "last", message_text: "יש עדכון" })]));

Deno.test("classifyWaits", async (t) => {
  await t.step(
    "asks once per group wait, caches it and meters the cost",
    async () => {
      const { fake, prompts, saved } = ports();
      const { reviews, llm } = await classifyWaits([group()], fake, run());
      assertEquals(reviews[0].verdict, verdict);
      assertEquals(
        [prompts.length, saved, llm],
        [1, ["group:111@g.us"], { calls: 1, costUsd: 0.002 }],
      );
    },
  );

  await t.step("direct-chat text never goes to the model", async () => {
    const { fake, prompts } = ports();
    const dm = review(thread([dmRow({ message_text: "פרטי" })]));
    const { reviews } = await classifyWaits([dm], fake, run());
    assertEquals([prompts.length, reviews[0].verdict], [0, null]);
  });

  await t.step(
    "a cached verdict for the same last message is reused",
    async () => {
      const cached = new Map([
        ["group:111@g.us", { messageId: "last", verdict }],
      ]);
      const { fake, prompts } = ports({ cached });
      const { reviews, llm } = await classifyWaits([group()], fake, run());
      assertEquals(
        [prompts.length, reviews[0].verdict, llm.calls],
        [0, verdict, 0],
      );
    },
  );

  await t.step("over the allowance the markers decide alone", async () => {
    const { fake, prompts } = ports({ dailyCapUsd: 0 });
    const { reviews } = await classifyWaits([group()], fake, run());
    assertEquals([prompts.length, reviews[0].verdict], [0, null]);
  });

  await t.step("a dry run asks but caches nothing", async () => {
    const { fake, saved } = ports();
    const { reviews } = await classifyWaits([group()], fake, run(true));
    assertEquals([saved.length, reviews[0].verdict], [0, verdict]);
  });

  await t.step(
    "markers that found both need no model; a bad answer is ignored",
    async () => {
      const both = { ...group(), markers: { request: true, complaint: true } };
      const first = ports();
      await classifyWaits([both], first.fake, run());
      assertEquals(first.prompts.length, 0);
      const broken = ports({ answer: "{oops" });
      const { reviews } = await classifyWaits([group()], broken.fake, run());
      assertEquals([reviews[0].verdict, broken.saved.length], [null, 0]);
    },
  );

  await t.step("no answer (no key, provider down) stops asking", async () => {
    const { fake, prompts } = ports({ answer: null });
    const other = review(
      thread([row({ thread_key: "group:222@g.us", message_text: "נו" })]),
    );
    const { reviews, llm } = await classifyWaits([group(), other], fake, run());
    assertEquals(
      [prompts.length, reviews.map((r) => r.verdict), llm.calls],
      [1, [null, null], 0],
    );
  });
});
