/**
 * The panel's device actions (a read, a navigation, a click or a type): one open action at a time, claimed from carmen-device-action
 * with the user's own session before anything else (plan rule 3), completed once, and
 * announced to the site with a result message that carries the id only. A cancel for the
 * open action, the card's life running out and the panel closing each stop it.
 */
import {
  DEVICE_CARD_LIFE_MS,
  type DeviceToolName,
} from "../../../supabase/functions/_shared/carmen/device/contract.ts";
import type { PanelClaimFailure } from "../../../supabase/functions/_shared/carmen/device/panel-envelope.ts";
import {
  type CompleteBody,
  completeBody,
  type ReadOutcome,
} from "./completion.ts";
import type { ActDeps } from "./actFlow.ts";
import { createTrustMemory } from "./trustMemory.ts";
import { type ShotDeps, shotOutcome } from "./shotFlow.ts";
import { type NavigateDeps, navigateOutcome } from "./navigateFlow.ts";
import {
  type ReadDeps,
  type ReadProgress,
  readOutcome,
  stoppedOutcome,
} from "./readFlow.ts";

/**
 * The claim's answer as the panel uses it: the tool and its arguments, unread, and what the
 * server decided about trust, on success; a reason to log otherwise. The panel acts only on
 * what its own claim returned (plan rule 3), and each flow checks the arguments before it
 * uses them.
 */
export type ClaimAnswer =
  | {
      ok: true;
      tool: DeviceToolName;
      arguments?: unknown;
      /** The origin the server allows a click or type on without a card, or null. */
      trustedOrigin: string | null;
      /** The step's conversation for a click or type, or null. */
      conversationId: string | null;
      /** For a screenshot, the manager's permission to picture a sensitive page, as the server read it. */
      sensitiveScreenshotsAllowed: boolean;
    }
  | { ok: false; failure: PanelClaimFailure; reason: string };

type Claimed = Extract<ClaimAnswer, { ok: true }>;

export type ReadActionDeps = ReadDeps &
  NavigateDeps &
  ActDeps &
  ShotDeps & {
    claim: (id: string) => Promise<ClaimAnswer>;
    /** Sends `complete`; rejects on a refusal or a failure that outlived its one retry, which is logged. */
    complete: (body: CompleteBody) => Promise<void>;
    /** Sends `complete` from a closing page: best effort, nothing is awaited. */
    completeOnClose: (body: CompleteBody) => void;
    /** Posts `carmen:result` for the id to the framed site. */
    postResult: (id: string) => void;
    /** Posts `carmen:claim-failed` for the id, and why, to the framed site. */
    postClaimFailed: (id: string, failure: PanelClaimFailure) => void;
    /** Shows the panel's own line asking the user to sign in to the extension. */
    showSignIn: () => void;
    /** Starts a timer and returns its cancel. */
    setTimer: (run: () => void, ms: number) => () => void;
  };

export type ReadActions = {
  onAction: (id: string) => Promise<void>;
  onCancel: (id: string) => void;
  onPanelClose: () => void;
};

type OpenAction = ReadProgress & { id: string };

/** The abort reason of a panel closing; reported as `cancelled` like any other stop but `expired`. */
const CLOSED = "closed";

/** The panel's handlers for the site's action and cancel messages and for its own closing. */
export function createReadActions(deps: ReadActionDeps): ReadActions {
  let open: OpenAction | null = null;
  const trust = createTrustMemory();

  /** Claims, reads and completes one action; a second while one is open is dropped. */
  async function onAction(id: string): Promise<void> {
    if (open) {
      console.warn(
        `[carmen-panel] dropped action ${id}: action ${open.id} is still open`,
      );
      return;
    }
    const action: OpenAction = {
      id,
      stopper: new AbortController(),
      decision: null,
      observed: null,
      asking: false,
    };
    open = action;
    try {
      await claimAndRun(action);
    } finally {
      open = null;
    }
  }

  /**
   * After a failed claim nothing ran and there is no result to continue from: the panel
   * tells the site why, so the chat says so at once, and without a session it also asks
   * the user to sign in to the extension.
   */
  async function claimAndRun(action: OpenAction): Promise<void> {
    const claim = await deps.claim(action.id);
    if (!claim.ok) {
      console.warn(
        `[carmen-panel] claim of action ${action.id} ${claim.failure}: ${claim.reason}`,
      );
      if (claim.failure === "signed_out") {
        deps.showSignIn();
      }
      deps.postClaimFailed(action.id, claim.failure);
      return;
    }
    const clearTimer = deps.setTimer(
      () => action.stopper.abort("expired"),
      DEVICE_CARD_LIFE_MS,
    );
    // A step that fails in Chrome (a blocked page, a closed tab) is reported `cancelled`:
    // the contract has no status for "could not do it" (AIO-656).
    const outcome = await stepOutcome(claim, action).catch((error: unknown) => {
      console.error(
        `[carmen-panel] ${claim.tool} for action ${action.id} failed`,
        error,
      );
      return stoppedOutcome(action);
    });
    clearTimer();
    // A closing panel has already sent the completion with keepalive.
    if (action.stopper.signal.reason !== CLOSED) {
      await finish(action.id, outcome);
    }
  }

  /** The claimed tool's flow: a navigation, a click or a type, a picture, or a read (which refuses every other tool). */
  function stepOutcome(
    claim: Claimed,
    action: OpenAction,
  ): Promise<ReadOutcome> {
    if (claim.tool === "browser_navigate") {
      return navigateOutcome(claim.arguments, action, deps);
    }
    if (claim.tool === "browser_click" || claim.tool === "browser_type") {
      return trust.act(claim.tool, claim, action, deps);
    }
    if (claim.tool === "browser_screenshot") {
      const allowed = claim.sensitiveScreenshotsAllowed;
      return shotOutcome(claim.arguments, allowed, action, deps);
    }
    return readOutcome(claim.tool, action, deps);
  }

  /** Completes the row, then tells the site whatever the completion's fate, so the run never hangs on the panel. */
  async function finish(id: string, outcome: ReadOutcome): Promise<void> {
    await deps.complete(completeBody(id, outcome)).catch((error: unknown) => {
      console.error(`[carmen-panel] completing action ${id} failed`, error);
    });
    deps.postResult(id);
  }

  /** Stops the open action when the cancel names it. */
  function onCancel(id: string): void {
    if (open?.id !== id) {
      console.warn(`[carmen-panel] cancel for ${id} matches no open action`);
      return;
    }
    open.stopper.abort("cancelled");
  }

  /**
   * A closing panel reports a step whose card is waiting as `cancelled`. A step past the
   * card is left claimed, and the server records it as `outcome_unknown`.
   */
  function onPanelClose(): void {
    if (!open?.asking) {
      return;
    }
    open.stopper.abort(CLOSED);
    deps.completeOnClose(completeBody(open.id, stoppedOutcome(open)));
  }

  return { onAction, onCancel, onPanelClose };
}
