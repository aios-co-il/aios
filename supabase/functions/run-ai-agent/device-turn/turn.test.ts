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
import { deviceActionOf, devicePauseAnswer } from "./turn.ts";
import { continuationBody } from "./continuation.test-fixture.ts";
import {
  ACTION,
  actionRow,
  capturing,
  COLLEAGUE,
  CONVERSATION,
  doneRow,
  NOW,
  openOver,
  OTHER_CONVERSATION,
  panelTurn,
  tablesWith,
} from "./turn.test-fixture.ts";

Deno.test(
  "a typed message closes the conversation's steps nobody will finish",
  async (t) => {
    await t.step(
      "waiting cards are cancelled, expired ones expire, claimed ones are unknown",
      async () => {
        const waiting = actionRow({
          id: "waiting",
          conversation_id: CONVERSATION,
        });
        const lapsed = actionRow({
          id: "lapsed",
          conversation_id: CONVERSATION,
          expires_at: NOW.toISOString(),
        });
        const claimed = actionRow({
          id: "claimed",
          conversation_id: CONVERSATION,
          status: "claimed",
        });
        const done = doneRow({ id: "done" });
        const elsewhere = actionRow({
          id: "elsewhere",
          conversation_id: OTHER_CONVERSATION,
        });
        const colleagues = actionRow({
          id: "colleague",
          conversation_id: CONVERSATION,
          user_id: COLLEAGUE,
        });

        await openOver(
          tablesWith([waiting, lapsed, claimed, done, elsewhere, colleagues]),
          panelTurn(),
        );

        assertEquals(
          [waiting, lapsed, claimed, done, elsewhere, colleagues].map(
            (row) => row.status,
          ),
          [
            "cancelled",
            "expired",
            "outcome_unknown",
            "done",
            "pending",
            "pending",
          ],
        );
        assertStrictEquals(waiting.completed_at, NOW.toISOString());
      },
    );

    await t.step("a failed close is logged and the turn goes on", async () => {
      let offered: Array<unknown> = [];

      const errors = await capturing("error", async () => {
        const { turn } = await openOver(
          tablesWith([actionRow({ conversation_id: CONVERSATION })]),
          panelTurn(),
          "carmen_device_actions",
        );
        offered = turn.offeredTools;
      });

      assertStrictEquals(errors.length, 1);
      assertEquals(offered.length, 1);
    });

    await t.step("a service caller's turn touches no step", async () => {
      const waiting = actionRow({ conversation_id: CONVERSATION });

      await openOver(tablesWith([waiting]), panelTurn({ authKind: "service" }));

      assertStrictEquals(waiting.status, "pending");
    });
  },
);

Deno.test(
  "a turn holding page text withholds the tools that send or write",
  async (t) => {
    const sendsOrWrites = [
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
    const tools = [...sendsOrWrites, "list_clients", "get_client_details"].map(
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
          ["list_clients", "get_client_details"],
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

  await t.step("only a written step is a device action", () => {
    assertEquals(
      deviceActionOf({
        device_action: { action_id: "a", tool: "browser_read_page" },
        message: "m",
      }),
      { action_id: "a", tool: "browser_read_page" },
    );
    assertStrictEquals(deviceActionOf({ error: "not_offered" }), null);
    assertStrictEquals(
      deviceActionOf({
        device_action: { action_id: "a", tool: "send_message" },
      }),
      null,
    );
    assertStrictEquals(deviceActionOf(null), null);
  });
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
