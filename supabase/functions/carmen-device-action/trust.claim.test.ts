import { assertEquals } from "jsr:@std/assert@1";
import {
  actionRow,
  answer,
  CLAIM,
  OTHER_TENANT,
  post,
  world,
} from "./handler.test-fixture.ts";
import {
  claimedTrust,
  click,
  CONVERSATION,
  OTHER_CONVERSATION,
  readOf,
  SHOP,
  trustOf,
} from "./trust.test-fixture.ts";

Deno.test("claim of a click or a type", async (t) => {
  await t.step(
    "names the trusted origin of a run that read only it",
    async () => {
      assertEquals(
        await claimedTrust(click(), {
          steps: [readOf(SHOP)],
          trusted: [trustOf(SHOP)],
        }),
        { trusted_origin: SHOP, conversation_id: CONVERSATION },
      );
    },
  );

  await t.step("a type is trusted the same way", async () => {
    const type = actionRow({
      tool: "browser_type",
      arguments: { snapshot_id: "s1", ref: "e1", text: "hi" },
      conversation_id: CONVERSATION,
    });

    const trust = await claimedTrust(type, {
      steps: [readOf(SHOP)],
      trusted: [trustOf(SHOP)],
    });

    assertEquals(trust.trusted_origin, SHOP);
  });

  await t.step("names none without the user's trust", async () => {
    assertEquals(await claimedTrust(click(), { steps: [readOf(SHOP)] }), {
      trusted_origin: null,
      conversation_id: CONVERSATION,
    });
  });

  await t.step(
    "names none when the run read another site too (tainted)",
    async () => {
      const trust = await claimedTrust(click(), {
        steps: [readOf(SHOP), readOf("https://mail.example")],
        trusted: [trustOf(SHOP), trustOf("https://mail.example")],
      });

      assertEquals(trust.trusted_origin, null);
    },
  );

  await t.step(
    "a trust leaks to no other origin of the same site",
    async () => {
      for (const read of [
        "https://www.shop.example",
        "https://shop.example:8443",
        "http://shop.example",
      ]) {
        const trust = await claimedTrust(click(), {
          steps: [readOf(read)],
          trusted: [trustOf(SHOP)],
        });

        assertEquals(trust.trusted_origin, null, read);
      }
    },
  );

  await t.step(
    "a trust leaks to no other conversation, user or org",
    async () => {
      for (const elsewhere of [
        trustOf(SHOP, OTHER_CONVERSATION),
        trustOf(SHOP, CONVERSATION, {
          user_id: "22222222-2222-4222-8222-222222222222",
        }),
        trustOf(SHOP, CONVERSATION, { tenant_id: OTHER_TENANT }),
      ]) {
        const trust = await claimedTrust(click(), {
          steps: [readOf(SHOP)],
          trusted: [elsewhere],
        });

        assertEquals(trust.trusted_origin, null);
      }
    },
  );

  await t.step("another run's read does not count for this run", async () => {
    const trust = await claimedTrust(click(), {
      steps: [{ ...readOf(SHOP), run_id: crypto.randomUUID() }],
      trusted: [trustOf(SHOP)],
    });

    assertEquals(trust.trusted_origin, null);
  });

  await t.step("a navigation, read or screenshot gets no trust", async () => {
    for (const tool of [
      "browser_navigate",
      "browser_read_page",
      "browser_screenshot",
    ]) {
      const trust = await claimedTrust(
        { ...click(), tool, arguments: {} },
        { steps: [readOf(SHOP)], trusted: [trustOf(SHOP)] },
      );

      assertEquals(
        trust,
        { trusted_origin: null, conversation_id: null },
        tool,
      );
    }
  });
});

Deno.test("claim with an unreadable trust", async (t) => {
  await t.step(
    "hands the step over with no trust, so the card asks",
    async () => {
      const { deps } = world(click(), {
        steps: [readOf(SHOP)],
        failing: "carmen_device_trusted_sites",
      });

      const claimed = await answer(post(CLAIM), deps);

      assertEquals(claimed.status, 200);
      assertEquals(claimed.body.trusted_origin, null);
    },
  );
});
