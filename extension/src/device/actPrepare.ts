/**
 * The part of a click or a type before its card (AIO-656): the claimed arguments, the tab's
 * real address, the site's grant, the read's element as the acting function finds it now,
 * and the contract's rules on all of them. Anything but a card to draw ends the step here.
 */
import { actAnswer } from "./actAnswer.ts";
import type { ActDeps } from "./actFlow.ts";
import {
  type ActArguments,
  actArguments,
  actRule,
  type ActTool,
  isSensitivePage,
  targetRefusal,
} from "./actStep.ts";
import { type CardWords, clickCardWords, typeCardWords } from "./cardWords.ts";
import type { ReadOutcome } from "./completion.ts";
import {
  ACT_RULES,
  PAGE_INPUT_KEY,
  PAGE_SNAPSHOT_KEY,
  type PageActRequest,
  type PageTarget,
} from "./keptSnapshot.ts";
import type { TabFacts } from "./readFlow.ts";
import { decideReadStep, type ReadStep } from "./readStep.ts";

/** Everything the card and the step after the tap are drawn from. */
export type PreparedAct = {
  tool: ActTool;
  claimed: ActArguments;
  tab: TabFacts;
  page: Extract<ReadStep, { kind: "read" }>;
  request: PageActRequest;
  /** The document the element was found in: the only one the tap may act in. */
  documentId: string;
  target: PageTarget;
  sensitive: boolean;
  words: CardWords;
};

/** The step ready for its card, or how it ended before one. */
export async function prepareAct(
  tool: ActTool,
  args: unknown,
  deps: ActDeps,
): Promise<PreparedAct | ReadOutcome> {
  const claimed = actArguments(tool, args);
  if (!claimed) {
    return refused(tool, "invalid_arguments");
  }
  const tab = await deps.activeTab();
  const page = decideReadStep(tab?.url, deps.origins);
  if (!tab || page.kind === "refuse") {
    return refused(tool, page.kind === "refuse" ? page.reason : "no tab");
  }
  if (!(await deps.isTabShared())) {
    return refused(tool, "sharing_off");
  }
  // A site the panel never read in this panel opening holds no snapshot to act on.
  if (!(await deps.hasGrant(page.pattern))) {
    return refused(tool, "no_grant");
  }

  const request: PageActRequest = {
    snapshotKey: PAGE_SNAPSHOT_KEY,
    inputKey: PAGE_INPUT_KEY,
    snapshotId: claimed.snapshotId,
    index: claimed.index,
    tool,
    rules: ACT_RULES,
  };
  const inspected = await deps.inspectTarget(tab.id, request);
  const found = actAnswer(inspected.answer);
  if (found?.kind !== "target") {
    console.warn(
      `[carmen-panel] ${tool} target: ${found?.kind === "changed" ? found.reason : "unreadable"}`,
    );
    return {
      status: "target_changed",
      decision: null,
      observed: page.location,
    };
  }
  const target = found.target;
  const sensitive = isSensitivePage(target.pageFields);
  const rule = actRule(tool, tab.url ?? "", sensitive, deps.origins);
  const refusal = rule === "ask" ? targetRefusal(tool, target) : rule;
  if (refusal) {
    return refused(tool, refusal);
  }
  return {
    tool,
    claimed,
    tab,
    page,
    request,
    documentId: inspected.documentId,
    target,
    sensitive,
    words:
      tool === "browser_type"
        ? typeCardWords({
            host: page.host,
            ...target,
            text: claimed.text ?? "",
          })
        : clickCardWords({ host: page.host, ...target }),
  };
}

/** A refusal before any card: logged, reported as `refused` with the rule `never`. */
function refused(tool: ActTool, reason: string): ReadOutcome {
  console.warn(`[carmen-panel] refused ${tool}: ${reason}`);
  return { status: "refused" };
}
