import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "../../budget.ts";
import {
  il,
  receiptRows,
  REPORT_VERDICT,
  row,
  staffRow,
  thread,
} from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import {
  ASKED_VERDICT,
  fakeClassifyPorts,
  modelAnswer,
} from "../../tests/fake-classify.ts";
import { type ClassifyPorts, classifyThreads } from "./classify.ts";
import type { Thread } from "./threads.ts";

const run = (dryRun = false) => ({
  tenantId: TENANT,
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

const none = new Set<string>();
const all = { dueKeys: none, raisedKeys: none, complaints: true };

const classify = (threads: Thread[], p: ClassifyPorts, dryRun = false) =>
  classifyThreads(threads, all, p, run(dryRun));

Deno.test("classifyThreads", async (t) => {
  await t.step(
    "asks once per new client message, caches it and meters the cost",
    async () => {
      const { fake, prompts, saved } = fakeClassifyPorts();
      const { verdicts, llm } = await classify([group()], fake);
      assertEquals(verdicts.get("group:111@g.us"), {
        messageId: "last",
        verdict: ASKED_VERDICT,
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
      const { fake, prompts } = fakeClassifyPorts();
      await classify([answered], fake);
      assertEquals(prompts.length, 1);
    },
  );

  await t.step("private groups and thanks never go to the model", async () => {
    const { fake, prompts } = fakeClassifyPorts();
    const privateGroup = thread([row({ message_text: "פרטי" })]);
    const { verdicts } = await classify(
      [privateGroup, group("תודה רבה 🙏")],
      fake,
    );
    assertEquals([prompts.length, verdicts.size], [0, 0]);
  });

  await t.step(
    "a cached verdict for the same message is reused; a preview keeps an older one unasked",
    async () => {
      const cached = new Map([
        ["group:111@g.us", { messageId: "last", verdict: ASKED_VERDICT }],
      ]);
      const hit = fakeClassifyPorts({ cached });
      const reused = await classify([group()], hit.fake);
      assertEquals(
        [hit.prompts.length, reused.verdicts.size, reused.llm.calls],
        [0, 1, 0],
      );
      const stale = new Map([
        ["group:111@g.us", { messageId: "older", verdict: ASKED_VERDICT }],
      ]);
      const miss = fakeClassifyPorts({ cached: stale });
      const kept = await classify([group()], miss.fake, true);
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
      const { fake, prompts, saved } = fakeClassifyPorts({
        answer: modelAnswer([2]),
      });
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
      const again = fakeClassifyPorts({
        cached: new Map([["group:111@g.us", saved[0]]]),
      });
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
    const cached = new Map([
      ["group:111@g.us", { messageId: "c1", verdict: ASKED_VERDICT }],
    ]);
    const { fake, prompts } = fakeClassifyPorts({ cached });
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
      const { fake, prompts, saved } = fakeClassifyPorts();
      const { verdicts } = await classify([group()], fake, true);
      assertEquals([prompts.length, saved.length, verdicts.size], [0, 0, 0]);
    },
  );

  await t.step(
    "markers that found everything need no model; a bad or billed empty answer is ignored",
    async () => {
      const first = fakeClassifyPorts();
      await classify([group("אני לא מרוצה, מתי זה יסתדר?")], first.fake);
      assertEquals(first.prompts.length, 0);
      for (const answer of ["{oops", null]) {
        const broken = fakeClassifyPorts({ answer, costUsd: 0.002 });
        const run = await classify([group()], broken.fake);
        assertEquals(
          [run.verdicts.size, broken.saved.length, run.llm, run.rejected],
          [0, 0, { calls: 1, costUsd: 0.002 }, 1],
          "metered, not cached, and counted",
        );
        assertEquals(run.modelDown, false, "a billed reply is no model down");
      }
    },
  );

  await t.step(
    "stops at 20 calls a run, however much they cost (no money limit)",
    async () => {
      const { fake, prompts } = fakeClassifyPorts({ costUsd: 5 });
      const waiting = Array.from({ length: 25 }, (_, i) =>
        group("יש עדכון", `group:${i}@g.us`),
      );
      const { llm } = await classifyThreads(waiting, all, fake, {
        ...run(),
        budget: RoundBudget.create(600_000, 100),
      });
      assertEquals([prompts.length, llm.calls, llm.costUsd], [20, 20, 100]);
    },
  );

  await t.step(
    "due waits are asked first; no answer stops asking",
    async () => {
      const { fake, prompts } = fakeClassifyPorts({ answer: null });
      const later = group("נו", "group:222@g.us");
      const { llm, modelDown } = await classifyThreads(
        [group(), later],
        { ...all, dueKeys: new Set(["group:222@g.us"]) },
        fake,
        run(),
      );
      assertEquals([prompts.length, llm.calls, modelDown], [1, 0, true]);
      assertEquals(prompts[0].includes("נו"), true);
    },
  );

  await t.step(
    "a receipt is read again only while the wait has no finding",
    async () => {
      const receipt = thread(receiptRows());
      const cached = new Map([
        ["group:111@g.us", { messageId: "c1", verdict: REPORT_VERDICT }],
      ]);
      for (const complaints of [true, false]) {
        const closed = fakeClassifyPorts({ cached });
        await classifyThreads(
          [receipt],
          { dueKeys: none, raisedKeys: none, complaints },
          closed.fake,
          run(),
        );
        assertEquals(closed.prompts.length, 1);
        const open = fakeClassifyPorts({ cached });
        await classifyThreads(
          [receipt],
          { dueKeys: none, raisedKeys: new Set([receipt.key]), complaints },
          open.fake,
          run(),
        );
        assertEquals(open.prompts.length, 0, "no paid call it cannot use");
      }
    },
  );
});
