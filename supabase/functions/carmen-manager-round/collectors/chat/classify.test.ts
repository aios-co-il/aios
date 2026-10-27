import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "../../budget.ts";
import { dmRow, il, row, staffRow, thread } from "../../tests/chat-fixtures.ts";
import { type ClassifyPorts, classifyThreads } from "./classify.ts";
import { createLlmMeter } from "./llm-meter.ts";
import type { CachedReview } from "./review-cache.ts";
import type { Thread } from "./threads.ts";
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
      load: () => Promise.resolve(new Map(fields.cached ?? [])),
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

/** A group the team writes in, with the client's message `text` last. */
const group = (text = "יש עדכון", key = "group:111@g.us"): Thread =>
  thread([
    staffRow({ thread_key: key, created_at: il("08:00") }),
    row({
      thread_key: key,
      message_id: "last",
      created_at: il("09:00"),
      message_text: text,
    }),
  ]);

const classify = (threads: Thread[], p: ClassifyPorts, dryRun = false) =>
  classifyThreads(threads, new Set(), p, run(dryRun));

Deno.test("classifyThreads", async (t) => {
  await t.step(
    "asks once per new client message, caches it and meters the cost",
    async () => {
      const { fake, prompts, saved } = ports();
      const { verdicts, llm } = await classify([group()], fake);
      assertEquals(verdicts.get("group:111@g.us"), {
        messageId: "last",
        verdict,
      });
      assertEquals(
        [prompts.length, saved, llm],
        [1, ["group:111@g.us"], { calls: 1, costUsd: 0.002 }],
      );
    },
  );

  await t.step(
    "asks about a group staff already answered (complaints at any age)",
    async () => {
      const answered = thread([
        staffRow({ created_at: il("08:00") }),
        row({
          message_id: "last",
          created_at: il("09:00"),
          message_text: "זה לא בסדר",
        }),
        staffRow({ created_at: il("09:05") }),
      ]);
      const { fake, prompts } = ports();
      await classify([answered], fake);
      assertEquals(prompts.length, 1);
    },
  );

  await t.step(
    "direct chats, private groups and thanks never go to the model",
    async () => {
      const { fake, prompts } = ports();
      const dm = thread([dmRow({ message_text: "פרטי" })]);
      const privateGroup = thread([row({ message_text: "פרטי" })]);
      const { verdicts } = await classify(
        [dm, privateGroup, group("תודה רבה 🙏")],
        fake,
      );
      assertEquals([prompts.length, verdicts.size], [0, 0]);
    },
  );

  await t.step(
    "a cached verdict for the same message is reused; a stale one dropped",
    async () => {
      const cached = new Map([
        ["group:111@g.us", { messageId: "last", verdict }],
      ]);
      const hit = ports({ cached });
      const reused = await classify([group()], hit.fake);
      assertEquals(
        [hit.prompts.length, reused.verdicts.size, reused.llm.calls],
        [0, 1, 0],
      );
      const stale = new Map([
        ["group:111@g.us", { messageId: "older", verdict }],
      ]);
      const miss = ports({ cached: stale, dailyCapUsd: 0 });
      const dropped = await classify([group()], miss.fake);
      assertEquals([miss.prompts.length, dropped.verdicts.size], [0, 0]);
    },
  );

  await t.step(
    "a dry run never asks; it uses cached verdicts only",
    async () => {
      const { fake, prompts, saved } = ports();
      const { verdicts } = await classify([group()], fake, true);
      assertEquals([prompts.length, saved.length, verdicts.size], [0, 0, 0]);
    },
  );

  await t.step(
    "markers that found everything need no model; a bad answer is ignored",
    async () => {
      const first = ports();
      await classify([group("אני לא מרוצה, מתי זה יסתדר?")], first.fake);
      assertEquals(first.prompts.length, 0);
      const broken = ports({ answer: "{oops" });
      const { verdicts } = await classify([group()], broken.fake);
      assertEquals([verdicts.size, broken.saved.length], [0, 0]);
    },
  );

  await t.step(
    "due waits are asked first; no answer stops asking",
    async () => {
      const { fake, prompts } = ports({ answer: null });
      const later = group("נו", "group:222@g.us");
      const { llm } = await classifyThreads(
        [group(), later],
        new Set(["group:222@g.us"]),
        fake,
        run(),
      );
      assertEquals([prompts.length, llm.calls], [1, 0]);
      assertEquals(prompts[0].includes("נו"), true);
    },
  );
});
