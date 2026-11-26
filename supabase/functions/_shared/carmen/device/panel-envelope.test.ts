import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  claimsPanelNamespace,
  PANEL_MESSAGE,
  PANEL_MESSAGE_NAMESPACE,
  PANEL_PROTOCOL_VERSION,
  panelCapabilities,
  panelSignal,
  panelTabContext,
  parsePanelMessage,
} from "./panel-envelope.ts";

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

  await t.step("refuses another version, kind or shape", () => {
    for (const data of [
      null,
      "carmen:hello",
      { type: PANEL_MESSAGE.hello },
      { type: PANEL_MESSAGE.hello, v: PANEL_PROTOCOL_VERSION + 1 },
      { type: "carmen:action", v: PANEL_PROTOCOL_VERSION },
      { type: "carmen:result", v: PANEL_PROTOCOL_VERSION },
      { type: PANEL_MESSAGE.tabContext, v: PANEL_PROTOCOL_VERSION },
      { type: PANEL_MESSAGE.capabilities, v: PANEL_PROTOCOL_VERSION },
      { type: "spike:ack", v: PANEL_PROTOCOL_VERSION },
    ]) {
      assertStrictEquals(parsePanelMessage(data), null);
    }
  });

  await t.step("tells a message of this namespace from a foreign one", () => {
    assertStrictEquals(claimsPanelNamespace({ type: "carmen:action" }), true);
    assertStrictEquals(claimsPanelNamespace({ type: "react-devtools" }), false);
    assertStrictEquals(claimsPanelNamespace("carmen:hello"), false);
  });
});
