import { describe, expect, it, vi } from "vitest";
import {
  PANEL_MESSAGE,
  panelSignal,
} from "../../../supabase/functions/_shared/carmen/device/panel-envelope.ts";
import { readSiteMessage, routeSiteMessage } from "./siteMessage.ts";

const APP_ORIGIN = "https://aios.co.il";
const FRAME = { name: "the framed site" };
const SITE = { appOrigin: APP_ORIGIN, frameWindow: FRAME };
const ID = "0b5e8f7a-3c1d-4e2f-9a8b-7c6d5e4f3a2b";

/** A message as the frame would deliver it. */
function fromSite(data: unknown) {
  return { origin: APP_ORIGIN, source: FRAME, data };
}

describe("readSiteMessage", () => {
  it("accepts the action, cancel and hello the site sends", () => {
    for (const type of [PANEL_MESSAGE.action, PANEL_MESSAGE.cancel]) {
      expect(
        readSiteMessage(fromSite({ type, v: 1, action_id: ID }), SITE),
      ).toEqual({
        kind: "accepted",
        message: { type, v: 1, action_id: ID },
      });
    }
    expect(
      readSiteMessage(fromSite({ type: PANEL_MESSAGE.hello, v: 1 }), SITE).kind,
    ).toBe("accepted");
  });

  it("keeps only the id of an action, whatever else the site adds", () => {
    const reading = readSiteMessage(
      fromSite({
        type: PANEL_MESSAGE.action,
        v: 1,
        action_id: ID,
        url: "https://evil.test",
      }),
      SITE,
    );

    expect(reading).toEqual({
      kind: "accepted",
      message: { type: PANEL_MESSAGE.action, v: 1, action_id: ID },
    });
  });

  it("drops a message from another origin or another window", () => {
    const action = { type: PANEL_MESSAGE.action, v: 1, action_id: ID };

    expect(
      readSiteMessage(
        { ...fromSite(action), origin: "https://evil.test" },
        SITE,
      ),
    ).toEqual({
      kind: "foreign",
      claimsNamespace: true,
    });
    expect(
      readSiteMessage({ ...fromSite(action), source: {} }, SITE).kind,
    ).toBe("foreign");
    expect(readSiteMessage({ ...fromSite("hi"), source: {} }, SITE)).toEqual({
      kind: "foreign",
      claimsNamespace: false,
    });
  });

  it("refuses the panel's own kinds, another version and a malformed id from the site", () => {
    const unexpected = [
      { type: PANEL_MESSAGE.result, v: 1, action_id: ID },
      { type: PANEL_MESSAGE.ready, v: 1 },
      { type: PANEL_MESSAGE.capabilities, v: 1, capabilities: [] },
      { type: PANEL_MESSAGE.tabContext, v: 1, tab: null },
      { type: PANEL_MESSAGE.action, v: 2, action_id: ID },
      { type: PANEL_MESSAGE.action, v: 1, action_id: "not-an-id" },
      { type: PANEL_MESSAGE.action, v: 1 },
    ];

    for (const data of unexpected) {
      expect(readSiteMessage(fromSite(data), SITE)).toEqual({
        kind: "unexpected",
      });
    }
  });
});

describe("routeSiteMessage", () => {
  /** Handlers that record what they were given. */
  function handlers() {
    return {
      onHello: vi.fn(),
      onAction: vi.fn(async () => {}),
      onCancel: vi.fn(),
    };
  }

  it("hands each accepted kind to its handler with the id only", () => {
    const called = handlers();

    routeSiteMessage(
      fromSite({ type: PANEL_MESSAGE.hello, v: 1 }),
      SITE,
      called,
    );
    routeSiteMessage(
      fromSite({ type: PANEL_MESSAGE.action, v: 1, action_id: ID }),
      SITE,
      called,
    );
    routeSiteMessage(
      fromSite({ type: PANEL_MESSAGE.cancel, v: 1, action_id: ID }),
      SITE,
      called,
    );

    expect(called.onHello).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(called.onAction).toHaveBeenCalledWith(ID);
    expect(called.onCancel).toHaveBeenCalledWith(ID);
  });

  it("hands the site's user id from a hello, and drops one that is not a uuid", () => {
    const called = handlers();

    routeSiteMessage(
      fromSite(panelSignal(PANEL_MESSAGE.hello, ID)),
      SITE,
      called,
    );
    routeSiteMessage(
      fromSite({ type: PANEL_MESSAGE.hello, v: 1, user_id: "a token" }),
      SITE,
      called,
    );

    expect(called.onHello.mock.calls).toEqual([[ID], [undefined]]);
  });

  it("acts on nothing from another origin", () => {
    const called = handlers();

    routeSiteMessage(
      {
        origin: "https://evil.test",
        source: FRAME,
        data: { type: PANEL_MESSAGE.action, v: 1, action_id: ID },
      },
      SITE,
      called,
    );

    expect(called.onAction).not.toHaveBeenCalled();
  });
});
