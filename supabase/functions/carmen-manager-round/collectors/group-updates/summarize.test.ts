import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "../../budget.ts";
import { entry, window } from "./group-fixtures.ts";
import { createLlmMeter } from "./llm-meter.ts";
import type { AskModel } from "./ask-model.ts";
import { digestWindows } from "./summarize.ts";

const now = new Date("2026-11-01T17:30:00Z");
const marked = window([
  { text: "מאשר את הבאנר החדש" },
  { text: "מתי עולה?" },
  { text: "מחר בבוקר", speaker: "staff" },
]);
const answer = JSON.stringify({
  material: true,
  update_text: "הלקוח אישר את הבאנר; עולה מחר",
  items: [{ type: "approval", text: "אישר את הבאנר" }],
});

/** Ports with a scripted model and a meter allowing `dailyCapUsd`. */
function ports(text: string | null, dailyCapUsd = 1) {
  const prompts: string[] = [];
  const ask: AskModel = (prompt) => {
    prompts.push(prompt);
    return Promise.resolve({ text, costUsd: 0.002 });
  };
  const meter = () =>
    Promise.resolve(
      createLlmMeter({
        monthBudgetUsd: null,
        monthSpentUsd: 0,
        dailyCapUsd,
        daySpentUsd: 0,
      }),
    );
  return { ports: { ask, meter }, prompts };
}

const run = (apiCalls = 10) => ({
  budget: RoundBudget.create(60_000, apiCalls),
  now,
});

Deno.test("digestWindows", async (t) => {
  await t.step("one metered model call per window", async () => {
    const { ports: p, prompts } = ports(answer);
    const { digests, llm } = await digestWindows([marked], [], p, run());
    assertEquals(digests[0].by, "model");
    assertEquals(
      digests[0].digest.update_text,
      "הלקוח אישר את הבאנר; עולה מחר",
    );
    assertEquals([llm.calls, prompts.length], [1, 1]);
    assertEquals(llm.costUsd, 0.002);
  });

  await t.step("the model never drops what the markers found", async () => {
    const quiet = JSON.stringify({
      material: false,
      update_text: "",
      items: [],
    });
    const { ports: p } = ports(quiet);
    const [found] = (await digestWindows([marked], [], p, run())).digests;
    assertEquals(
      [found.by, found.modelMaterial, found.digest.material],
      ["markers", false, true],
    );
    const chat = window([
      { text: "מה שלומכם?" },
      { text: "הכל טוב" },
      { text: "נדבר" },
    ]);
    const [smallTalk] = (await digestWindows([chat], [], p, run())).digests;
    assertEquals([smallTalk.by, smallTalk.digest.material], ["model", false]);
  });

  await t.step(
    "over the day's allowance the markers decide, with no call",
    async () => {
      const { ports: p, prompts } = ports(answer, 0);
      const { digests, llm } = await digestWindows([marked], [], p, run());
      assertEquals(
        [digests[0].by, digests[0].digest.material],
        ["markers", true],
      );
      assertEquals([llm.calls, prompts.length], [0, 0]);
    },
  );

  await t.step("no API call left in the round: markers", async () => {
    const { ports: p, prompts } = ports(answer);
    const { digests } = await digestWindows([marked], [], p, run(0));
    assertEquals([digests[0].by, prompts.length], ["markers", 0]);
  });

  await t.step(
    "an unusable answer is metered and the markers decide",
    async () => {
      const { ports: p } = ports("not json");
      const { digests, llm } = await digestWindows([marked], [], p, run());
      assertEquals([digests[0].by, llm.calls], ["markers", 1]);
    },
  );

  await t.step("items already on today's card are dropped", async () => {
    const { ports: p } = ports(answer);
    const { digests } = await digestWindows(
      [marked],
      [entry("2026-11-01T12:00:00Z", "הלקוח אישר את הבאנר")],
      p,
      run(),
    );
    assertEquals([digests[0].dropped, digests[0].digest.material], [1, false]);
  });

  await t.step(
    "after a drop the card line holds only the items kept",
    async () => {
      const two = JSON.stringify({
        material: true,
        update_text: "הלקוח אישר את הבאנר; ביקש להעלות מחר בבוקר",
        items: [
          { type: "approval", text: "אישר את הבאנר" },
          { type: "request", text: "ביקש להעלות מחר בבוקר" },
        ],
      });
      const { ports: p } = ports(two);
      const [kept] = (
        await digestWindows(
          [marked],
          [entry("2026-11-01T12:00:00Z", "הלקוח אישר את הבאנר")],
          p,
          run(),
        )
      ).digests;
      assertEquals(
        [kept.dropped, kept.digest.material, kept.digest.update_text],
        [1, true, "ביקש להעלות מחר בבוקר"],
      );
    },
  );

  await t.step(
    "a held call the model names makes a quiet window material",
    async () => {
      const called = window([
        { text: "מה שלומכם?" },
        { text: "דיברנו בטלפון עם הלקוח", speaker: "staff" },
        { text: "תודה" },
      ]);
      const quiet = (tense: string) =>
        JSON.stringify({
          material: false,
          update_text: "",
          items: [],
          contact: { line: 2, kind: "call", tense, text: "שיחה עם הלקוח" },
        });
      const { ports: held } = ports(quiet("past"));
      const [d] = (await digestWindows([called], [], held, run())).digests;
      assertEquals(
        [d.by, d.contact?.kind, d.contact?.message.id, d.digest.material],
        ["model", "call", "m2", true],
      );
      assertEquals(d.digest.update_text, "שיחה עם הלקוח");
      const later = window([
        { text: "מה שלומכם?" },
        { text: "נדבר מחר בטלפון", speaker: "staff" },
      ]);
      const { ports: planned } = ports(quiet("planned"));
      const [p] = (await digestWindows([later], [], planned, run())).digests;
      assertEquals([p.contact, p.digest.material], [null, false]);
    },
  );

  await t.step(
    "the markers find a contact only when the model gave no answer",
    async () => {
      const called = window([
        { text: "מה שלומכם?" },
        { text: "בהמשך לשיחתנו בטלפון, הכל מאושר", speaker: "staff" },
        { text: "תודה" },
      ]);
      const none = JSON.stringify({
        material: false,
        update_text: "",
        items: [],
        contact: null,
      });
      const [answered] = (
        await digestWindows([called], [], ports(none).ports, run())
      ).digests;
      assertEquals(answered.contact, null);
      const [silent] = (
        await digestWindows([called], [], ports("not json").ports, run())
      ).digests;
      assertEquals(
        [silent.by, silent.contact?.kind, silent.contact?.message.id],
        ["markers", "call", "m2"],
      );
    },
  );

  await t.step("no window: the meter is never loaded", async () => {
    const { ports: p } = ports(answer);
    const loaded: boolean[] = [];
    const meter = () => {
      loaded.push(true);
      return p.meter();
    };
    await digestWindows([], [], { ...p, meter }, run());
    assertEquals(loaded, []);
  });
});
