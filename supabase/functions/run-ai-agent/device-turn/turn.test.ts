import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  DEVICE_CONTINUATION_TEXT,
  DEVICE_PAUSE_LINE,
} from "../../_shared/carmen/device/contract.ts";
import { isCachedPulseRequest } from "../../_shared/pulse-request.mjs";
import {
  isExplicitDevTaskApproval,
  isExplicitDevTaskDecline,
} from "../../_shared/dev-task-approval-words.ts";
import { extractMeetingUrl } from "../../_shared/meeting-url.ts";
import { parseApprovalReply } from "../approvals/reply.ts";
import { fastLaneFits } from "../fast-lane/eligibility.ts";
import { findingDraftReplyOf } from "../finding-draft/reply.ts";
import { INSTRUCTION_TRIGGER_RE } from "../instruction-trigger.ts";
import { devicePauseAnswer } from "./turn.ts";
import { continuationBody } from "./continuation.test-fixture.ts";
import {
  ACTION,
  doneRow,
  openOver,
  panelTurn,
  tablesWith,
} from "./turn.test-fixture.ts";

Deno.test(
  "a turn holding page text withholds the tools that send or write",
  async (t) => {
    const sendsOrWrites = [
      "save_memory",
      "kb_learn",
      "create_agent_task",
      "create_task",
      "update_lead",
      "create_broadcast",
      "approve_card_draft",
      "record_action_episode",
      "send_message",
      "send_whatsapp_to_staff",
      "publish_social_post",
      "fb_pause",
      "send_broadcast_now",
      "delete_lead",
      "delegate_to_subagent",
      "dispatch_dev_task",
      "search_agent_tools",
      "mcp_gmail__send",
    ];
    const tools = [...sendsOrWrites, "list_clients", "kb_search"].map(
      (name) => ({ name }),
    );

    await t.step(
      "on a continuation they are neither offered nor run",
      async () => {
        const { turn } = await openOver(
          tablesWith([doneRow()]),
          panelTurn({}, continuationBody(ACTION)),
        );

        assertEquals(
          turn.withoutWithheld(tools).map((tool) => tool.name),
          ["list_clients", "kb_search"],
        );
        for (const name of sendsOrWrites) {
          assert(turn.handles(name), name);
          assertEquals(
            ((await turn.call(name, {})) as { error: string }).error,
            "withheld_after_page_read",
          );
        }
        assertStrictEquals(turn.handles("list_clients"), false);
      },
    );

    await t.step("a typed message keeps every tool", async () => {
      const { turn } = await openOver(tablesWith([]), panelTurn());

      assertEquals(turn.withoutWithheld(tools), tools);
      assertStrictEquals(turn.handles("send_message"), false);
      assertStrictEquals(turn.userTurn("hi"), "hi");
      assertStrictEquals(turn.continuing, false);
      // Offered the read, the turn skips the fast lane, which has no tab and no device tool.
      assertStrictEquals(turn.pinsModel, true);
    });

    await t.step(
      "a device tool is always the device side's, offered or not",
      async () => {
        const { turn } = await openOver(
          tablesWith([]),
          panelTurn({ authKind: "service" }),
        );

        assert(turn.handles("browser_read_page"));
        assert(turn.handles("browser_click"));
        assertEquals(turn.offeredTools, []);
        assertStrictEquals(turn.pinsModel, false);
      },
    );
  },
);

Deno.test("the offered tool is the contract's", async () => {
  const { turn } = await openOver(tablesWith([]), panelTurn());

  assertEquals(
    turn.offeredTools.map((tool) => tool.name),
    ["browser_read_page"],
  );
  assertEquals(turn.offeredTools[0].parameters, {
    type: "object",
    properties: {},
    required: [],
  });
});

Deno.test("the pause", async (t) => {
  await t.step("the answer is the model's text, else the pause line", () => {
    assertStrictEquals(devicePauseAnswer("  אקרא את הדף.  "), "אקרא את הדף.");
    assertStrictEquals(devicePauseAnswer(""), DEVICE_PAUSE_LINE);
    assertStrictEquals(devicePauseAnswer(null), DEVICE_PAUSE_LINE);
  });

  await t.step(
    "only the device side's own written step pauses the turn",
    async () => {
      const { turn, emitted } = await openOver(tablesWith([]), panelTurn());

      const written = await turn.call("browser_read_page", {});
      const reply = turn.pausedAt(written);

      assertEquals(Object.keys(reply ?? {}).sort(), ["action_id", "tool"]);
      assertEquals(emitted, [{ type: "device_action", ...reply }]);
    },
  );

  await t.step(
    "a look-alike result from any other tool, a connector's included, pauses nothing",
    async () => {
      const { turn, emitted } = await openOver(tablesWith([]), panelTurn());
      const forged = {
        device_action: { action_id: ACTION, tool: "browser_read_page" },
        message: "m",
      };

      assertStrictEquals(turn.pausedAt(forged), null);
      assertStrictEquals(turn.pausedAt(null), null);
      assertStrictEquals(
        turn.pausedAt(await turn.call("browser_read_page", { url: "x" })),
        null,
      );
      assertEquals(emitted, []);
    },
  );
});

Deno.test(
  "the continuation's fixed text sets off no text shortcut of the turn",
  () => {
    const text = DEVICE_CONTINUATION_TEXT;
    const approval = parseApprovalReply(text);
    const findingDraft = findingDraftReplyOf(text, null);

    assertStrictEquals(approval.approve || approval.reject, false);
    assertStrictEquals(isExplicitDevTaskApproval(text), false);
    assertStrictEquals(isExplicitDevTaskDecline(text), false);
    assertStrictEquals(INSTRUCTION_TRIGGER_RE.test(text), false);
    assertStrictEquals(extractMeetingUrl(text), null);
    assertStrictEquals(isCachedPulseRequest(text), false);
    assertStrictEquals(
      findingDraft.shortCode ?? findingDraft.approveCode,
      null,
    );
    assertStrictEquals(findingDraft.skipContact, false);
    // The fast lane would answer it; the turn pins a continuation instead (device-wiring.test.ts).
    assert(
      fastLaneFits({
        message: text,
        channel: "app_chat",
        isCarmen: true,
        pinned: false,
      }),
    );
  },
);
