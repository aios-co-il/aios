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
  complaint_ids: [],
  urgency: "normal",
  summary_he: "מבקש להעלות מבצע",
  confidence: 0.9,
};

/** The model's answer for `verdict` naming complaint `lines`. */
const answer = (lines: number[] = []) => {
  const { complaint_ids: _ids, ...rest } = verdict;
  return JSON.stringify({ ...rest, complaint_lines: lines });
};

function ports(
  fields: {
    cached?: Map<string, CachedReview>;
    dailyCapUsd?: number;
    answer?: string | null;
  } = {},
) {
  const prompts: string[] = [];
  const saved: CachedReview[] = [];
  const meter = createLlmMeter({
    monthBudgetUsd: null,
    monthSpentUsd: 0,
    dailyCapUsd: fields.dailyCapUsd ?? 1,
    daySpentUsd: 0,
  });
  const fake: ClassifyPorts = {
    cache: {
      load: () => Promise.resolve(new Map(fields.cached ?? [])),
      save: (_key, review) => {
        saved.push({ messageId: review.messageId, verdict: review.verdict });
        return Promise.resolve();
      },
    },
    ask: (prompt) => {
      prompts.push(prompt);
      const text = fields.answer === undefined ? answer() : fields.answer;
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

const all = { dueKeys: new Set<string>(), complaints: true };

const classify = (threads: Thread[], p: ClassifyPorts, dryRun = false) =>
  classifyThreads(threads, all, p, run(dryRun));

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
        [prompts.length, saved.length, llm],
        [1, 1, { calls: 1, costUsd: 0.002 }],
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
    "a cached verdict for the same message is reused; an older one is kept unasked",
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
      const kept = await classify([group()], miss.fake);
      assertEquals(miss.prompts.length, 0);
      assertEquals(kept.verdicts.get("group:111@g.us")?.messageId, "older");
    },
  );

  await t.step(
    "a complaint answered and thanked before the run is still read and named",
    async () => {
      const thanked = thread([
        staffRow({ message_id: "hi", created_at: il("08:00") }),
        row({
          message_id: "c1",
          created_at: il("14:10"),
          message_text: "הלידים שלכם זבל, שוקל לעזוב",
        }),
        staffRow({ message_id: "s1", created_at: il("14:20") }),
        row({
          message_id: "c2",
          created_at: il("14:25"),
          message_text: "תודה",
        }),
      ]);
      const { fake, prompts, saved } = ports({ answer: answer([2]) });
      const { verdicts } = await classify([thanked], fake);
      assertEquals(prompts.length, 1);
      assertEquals(
        prompts[0].includes("[2*] 14:10 לקוח: הלידים שלכם זבל"),
        true,
      );
      assertEquals(verdicts.get("group:111@g.us")?.verdict.complaint_ids, [
        "c1",
      ]);
      assertEquals(
        saved[0].messageId,
        "c2",
        "read up to the latest client line",
      );
      const again = ports({ cached: new Map([["group:111@g.us", saved[0]]]) });
      await classify([thanked], again.fake);
      assertEquals(again.prompts.length, 0, "each line is read once");
    },
  );

  await t.step("only the lines after the last one read are new", async () => {
    const more = thread([
      staffRow({ message_id: "hi", created_at: il("08:00") }),
      row({
        message_id: "c1",
        created_at: il("09:00"),
        message_text: "יש עדכון",
      }),
      staffRow({ message_id: "s1", created_at: il("09:10") }),
      row({
        message_id: "c2",
        created_at: il("09:20"),
        message_text: "זה לא מה שסיכמנו",
      }),
    ]);
    const cached = new Map([["group:111@g.us", { messageId: "c1", verdict }]]);
    const { fake, prompts } = ports({ cached });
    await classify([more], fake);
    assertEquals(prompts[0].includes("[2] 09:00 לקוח: יש עדכון"), true);
    assertEquals(
      prompts[0].includes("[4*] 09:20 לקוח: זה לא מה שסיכמנו"),
      true,
    );
  });

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
        { dueKeys: new Set(["group:222@g.us"]), complaints: true },
        fake,
        run(),
      );
      assertEquals([prompts.length, llm.calls], [1, 0]);
      assertEquals(prompts[0].includes("נו"), true);
    },
  );
});
