/**
 * The panel's own memory of the sites the user trusted on a click or typing card in this
 * panel opening, by conversation (AIO-656). A click or type runs without a card only when
 * the server's claim names the same origin too, so a trust recorded by anything but this
 * panel's card skips no card, and a closed panel forgets every trust, as it drops its site
 * grants (plan §2.6).
 */
import { type ActDeps, actOutcome } from "./actFlow.ts";
import type { ActTool } from "./actStep.ts";
import type { ReadOutcome } from "./completion.ts";
import type { ReadProgress } from "./readFlow.ts";

/** What a claim says about trust: the origin the server allows without a card, and the conversation. */
export type ClaimedTrust = {
  arguments?: unknown;
  trustedOrigin: string | null;
  conversationId: string | null;
};

/** The memory, and a click or a type run under it. */
export function createTrustMemory() {
  const ticked = new Set<string>();

  /**
   * Runs the step on the trusted origin only when the server names it and the user ticked
   * it here for the same conversation; a tick on its own card is remembered.
   */
  async function act(
    tool: ActTool,
    claim: ClaimedTrust,
    progress: ReadProgress,
    deps: ActDeps,
  ): Promise<ReadOutcome> {
    /** The memory's key for one origin of this conversation. */
    function key(origin: string): string {
      return `${claim.conversationId} ${origin}`;
    }

    const origin =
      claim.conversationId &&
      claim.trustedOrigin &&
      ticked.has(key(claim.trustedOrigin))
        ? claim.trustedOrigin
        : null;
    const outcome = await actOutcome(tool, claim.arguments, progress, deps, {
      origin,
    });
    if (
      outcome.status === "done" &&
      outcome.trustOrigin &&
      claim.conversationId
    ) {
      ticked.add(key(outcome.trustOrigin));
    }
    return outcome;
  }

  return { act };
}
