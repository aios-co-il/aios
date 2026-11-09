import type { RunState } from "./state.ts";
import { stoppedReply } from "../run-cancel.ts";
import {
  fallbackReply,
  stoppedAtStepLimit,
} from "../../_shared/workshop/reply.ts";
import type { RunInputs } from "./contracts.ts";

/** Suppresses repeated streamed text while retaining the final-answer suffix. */
export function createLoopTextEmitter(
  emit: RunInputs["emit"],
  emittedTexts: Array<string>,
) {
  function emitText(text: string) {
    const key = text.trim();
    if (!emit || !key || emittedTexts.includes(key)) {
      return;
    }
    // A final answer that opens with texts already sent adds only the rest.
    let fresh = key;
    for (const sent of emittedTexts) {
      if (fresh.startsWith(sent)) {
        fresh = fresh.slice(sent.length).trim();
      }
    }
    emittedTexts.push(key);
    if (!fresh) {
      return;
    }
    emit({
      type: "token",
      content: emittedTexts.length > 1 ? `\n\n${fresh}` : fresh,
    });
  }
  return emitText;
}

/** Complete stopped or otherwise empty replies after the model loop. */
export function finalizeLoopText(
  run: RunState,
  roundsRun: number,
  stoppedByUser: boolean,
): void {
  if (stoppedByUser) {
    const stopped = stoppedReply(run.toolLog.map((t) => t.tool));
    run.finalOutput = [String(run.finalOutput || "").trim(), stopped]
      .filter(Boolean)
      .join("\n\n");
    if (run.input.emit) {
      run.input.emit({ type: "token", content: `\n\n${stopped}` });
    }
  }
  if (!String(run.finalOutput || "").trim()) {
    const fallback = fallbackReply(run.toolLog, {
      outOfSteps: stoppedAtStepLimit(
        roundsRun,
        run.maxRounds,
        run.messages[run.messages.length - 1]?.role,
      ),
    });
    if (fallback) {
      run.finalOutput = fallback;
      if (run.input.emit) {
        run.input.emit({ type: "token", content: fallback });
      }
    }
  }
}
