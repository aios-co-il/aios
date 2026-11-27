import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { bodyUuid } from "../../agent-runs/body-id.ts";
import { DEVICE_TOOL_NAMES } from "./contract.ts";
import {
  claimsPanelNamespace,
  PANEL_CLAIM_FAILURES,
  PANEL_MESSAGE,
  PANEL_MESSAGE_NAMESPACE,
  PANEL_PROTOCOL_VERSION,
  panelActionRef,
  panelCapabilities,
  panelClaimFailed,
  panelSignal,
  panelTabContext,
  parsePanelMessage,
} from "./panel-envelope.ts";

const ACTION_ID = "0f8e7f2c-5b1d-4c6e-9a3b-2d4f6a8c0e1f";

const ACTION_KINDS = [
  PANEL_MESSAGE.action,
  PANEL_MESSAGE.result,
  PANEL_MESSAGE.cancel,
];

Deno.test("panel envelope", async (t) => {
  await t.step("every kind sits under one namespace", () => {
    for (const type of Object.values(PANEL_MESSAGE)) {
      assertStrictEquals(type.startsWith(PANEL_MESSAGE_NAMESPACE), true, type);
    }
  });

  await t.step("each built message reads back as itself", () => {
    for (const message of [
      panelSignal(PANEL_MESSAGE.hello),
      panelSignal(PANEL_MESSAGE.ready),
      panelCapabilities(),
      panelTabContext({ url: "https://example.com/a", title: "A" }),
      panelTabContext(null),
      panelCapabilities(["tab-context", ...DEVICE_TOOL_NAMES]),
      ...ACTION_KINDS.map((type) => panelActionRef(type, ACTION_ID)),
    ]) {
      assertEquals(parsePanelMessage(structuredClone(message)), message);
    }
  });

  await t.step("a tab is cleaned on the way out and on the way in", () => {
    const sent = panelTabContext({
      url: "https://example.com/a?token=1#x",
      title: "A\nB",
    });
    const received = parsePanelMessage({
      type: PANEL_MESSAGE.tabContext,
      v: PANEL_PROTOCOL_VERSION,
      tab: { url: "https://example.com/b?token=2", title: "B", extra: 1 },
    });

    assertEquals(sent, {
      type: "carmen:tab-context",
      v: 1,
      tab: { url: "https://example.com/a", title: "A B" },
    });
    assertEquals(received, {
      type: "carmen:tab-context",
      v: 1,
      tab: { url: "https://example.com/b", title: "B" },
    });
  });

  await t.step("a tab that is not a web page becomes null", () => {
    assertEquals(panelTabContext({ url: "chrome://settings", title: "S" }), {
      type: "carmen:tab-context",
      v: 1,
      tab: null,
    });
  });

  await t.step("unknown capabilities are dropped", () => {
    assertEquals(
      parsePanelMessage({
        type: PANEL_MESSAGE.capabilities,
        v: PANEL_PROTOCOL_VERSION,
        capabilities: ["tab-context", "click", 7],
      }),
      panelCapabilities(),
    );
  });

  await t.step(
    "a build announces tab sharing only until it names a tool",
    () => {
      assertEquals(panelCapabilities(), {
        type: "carmen:capabilities",
        v: 1,
        capabilities: ["tab-context"],
      });
      assertEquals(
        parsePanelMessage({
          type: PANEL_MESSAGE.capabilities,
          v: PANEL_PROTOCOL_VERSION,
          capabilities: ["browser_read_page", "browser_drag", "tab-context"],
        }),
        panelCapabilities(["tab-context", "browser_read_page"]),
      );
    },
  );

  await t.step("an action message keeps its id and nothing else", () => {
    for (const type of ACTION_KINDS) {
      assertEquals(
        parsePanelMessage({
          type,
          v: PANEL_PROTOCOL_VERSION,
          action_id: ACTION_ID,
          tool: "browser_click",
          args: { ref: "e1" },
          url: "https://example.com/",
        }),
        { type, v: 1, action_id: ACTION_ID },
      );
    }
  });

  await t.step("refuses an action whose id is not a row id", () => {
    for (const action_id of [
      undefined,
      null,
      7,
      "",
      "1",
      ACTION_ID.replaceAll("-", ""),
      `{${ACTION_ID}}`,
      ` ${ACTION_ID}`,
      `${ACTION_ID}\n`,
      `${ACTION_ID}' or '1'='1`,
      ACTION_ID.replace("0", "g"),
      [ACTION_ID],
      { id: ACTION_ID },
    ]) {
      for (const type of ACTION_KINDS) {
        assertStrictEquals(
          parsePanelMessage({ type, v: PANEL_PROTOCOL_VERSION, action_id }),
          null,
        );
      }
      // The same answer the server's own id reader gives.
      assertStrictEquals(bodyUuid(action_id), null);
    }
  });

  await t.step("reads an id the way the server's id reader does", () => {
    for (const action_id of [ACTION_ID, ACTION_ID.toUpperCase()]) {
      assertStrictEquals(bodyUuid(action_id), action_id);
      assertEquals(
        parsePanelMessage(panelActionRef(PANEL_MESSAGE.action, action_id)),
        { type: "carmen:action", v: 1, action_id },
      );
    }
  });

  await t.step("refuses an action of another version or kind", () => {
    for (const [type, v] of [
      [PANEL_MESSAGE.action, PANEL_PROTOCOL_VERSION + 1],
      [PANEL_MESSAGE.result, 0],
      [PANEL_MESSAGE.cancel, "1"],
      ["carmen:approve", PANEL_PROTOCOL_VERSION],
      ["carmen:action-result", PANEL_PROTOCOL_VERSION],
      ["carmen:actions", PANEL_PROTOCOL_VERSION],
      ["CARMEN:ACTION", PANEL_PROTOCOL_VERSION],
      ["action", PANEL_PROTOCOL_VERSION],
    ]) {
      assertStrictEquals(
        parsePanelMessage({ type, v, action_id: ACTION_ID }),
        null,
      );
    }
  });

  await t.step("refuses another version, kind or shape", () => {
    for (const data of [
      null,
      "carmen:hello",
      { type: PANEL_MESSAGE.hello },
      { type: PANEL_MESSAGE.hello, v: PANEL_PROTOCOL_VERSION + 1 },
      { type: "carmen:action", v: PANEL_PROTOCOL_VERSION },
      { type: "carmen:result", v: PANEL_PROTOCOL_VERSION },
      { type: "carmen:cancel", v: PANEL_PROTOCOL_VERSION },
      { type: PANEL_MESSAGE.tabContext, v: PANEL_PROTOCOL_VERSION },
      { type: PANEL_MESSAGE.capabilities, v: PANEL_PROTOCOL_VERSION },
      { type: "spike:ack", v: PANEL_PROTOCOL_VERSION },
    ]) {
      assertStrictEquals(parsePanelMessage(data), null);
    }
  });

  await t.step(
    "a failed claim keeps its id and a known reason, and nothing else",
    () => {
      for (const reason of PANEL_CLAIM_FAILURES) {
        const message = panelClaimFailed(ACTION_ID, reason);

        assertEquals(parsePanelMessage({ ...message, detail: "x" }), {
          type: "carmen:claim-failed",
          v: 1,
          action_id: ACTION_ID,
          reason,
        });
      }
      for (const data of [
        { reason: "expired" },
        { reason: undefined },
        { reason: "refused", action_id: "1" },
      ]) {
        assertStrictEquals(
          parsePanelMessage({
            type: PANEL_MESSAGE.claimFailed,
            v: PANEL_PROTOCOL_VERSION,
            action_id: ACTION_ID,
            ...data,
          }),
          null,
        );
      }
    },
  );

  await t.step("tells a message of this namespace from a foreign one", () => {
    assertStrictEquals(claimsPanelNamespace({ type: "carmen:action" }), true);
    assertStrictEquals(claimsPanelNamespace({ type: "react-devtools" }), false);
    assertStrictEquals(claimsPanelNamespace("carmen:hello"), false);
  });
});
