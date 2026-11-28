import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PANEL_MESSAGE,
  panelSignal,
} from "@functions/_shared/carmen/device/panel-envelope.ts";
import { EXTENSION_ORIGINS } from "./extensionOrigins";
import { useExtensionPanel } from "./useExtensionPanel";
import { frameThePage } from "./useExtensionPanel.test-fixture";

const PANEL_ORIGIN = EXTENSION_ORIGINS[0];
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

describe("useExtensionPanel: the site's user in the hello", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.location, "ancestorOrigins");
  });

  it("names the signed-in user in the hello, and says hello again when the user changes", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { rerender } = renderHook(
      ({ userId }) => useExtensionPanel(userId).tabContext,
      { initialProps: { userId: USER_ID } },
    );

    rerender({ userId: OTHER_USER_ID });

    expect(parent.postMessage.mock.calls).toEqual([
      [panelSignal(PANEL_MESSAGE.hello, USER_ID), PANEL_ORIGIN],
      [panelSignal(PANEL_MESSAGE.hello, OTHER_USER_ID), PANEL_ORIGIN],
    ]);
    expect(parent.postMessage.mock.calls[0][0]).toEqual({
      type: PANEL_MESSAGE.hello,
      v: 1,
      user_id: USER_ID,
    });
  });
});
