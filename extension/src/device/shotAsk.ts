/**
 * The rule and the card before a screenshot (AIO-656), as shotFlow.ts runs them. Chrome
 * captures a tab only for an extension holding `<all_urls>` (or `activeTab`, which the side
 * panel never receives), and asks for it only from a tap: so every picture shows the card,
 * whose tap asks Chrome for that grant, and the panel gives it back right after the capture.
 * The contract's rule still decides what is refused: a sensitive page (the act floor, or a
 * password or payment field) without the manager's permission never gets a card. The fields
 * are read again after the tap, when the grant reaches every frame (a payment form in
 * another site's frame among them, and every frame of a site not granted before); a
 * sensitive page found then gets a second card, so what the user approves always names the
 * page as sensitive, or is refused.
 */
import { screenshotCardWords } from "./cardWords.ts";
import type { ReadOutcome } from "./completion.ts";
import {
  type ReadProgress,
  stoppedOutcome,
  type TabFacts,
  waitForCard,
} from "./readFlow.ts";
import type { ReadablePage, ShotDeps } from "./shotFlow.ts";
import { refusedShot, sensitiveFrames, shotRule } from "./shotStep.ts";

/** `allowed` after the card's tap (and a second one on a page found sensitive), otherwise how the step ended. */
export async function askOnShotCard(
  tab: TabFacts,
  page: ReadablePage,
  allowed: boolean,
  progress: ReadProgress,
  deps: ShotDeps,
): Promise<"allowed" | ReadOutcome> {
  const url = tab.url ?? "";
  const granted = await deps.hasGrant(page.pattern);
  const before = shotRule(
    url,
    granted && sensitiveFrames(await deps.pageFields(tab.id)),
    allowed,
    deps.origins,
  );
  if (before !== "free" && before !== "ask") {
    return refusedShot(before);
  }

  const first = await card(page, before === "ask", progress, deps);
  if (first !== "allowed") {
    return first;
  }
  const after = shotRule(
    url,
    sensitiveFrames(await deps.pageFields(tab.id)),
    allowed,
    deps.origins,
  );
  if (after !== "free" && after !== "ask") {
    return refusedShot(after);
  }
  return after === "ask" && before !== "ask"
    ? card(page, true, progress, deps)
    : "allowed";
}

/** Shows one screenshot card, whose tap asks Chrome for the capture grant; `allowed`, or how the step ended. */
async function card(
  page: ReadablePage,
  sensitive: boolean,
  progress: ReadProgress,
  deps: ShotDeps,
): Promise<"allowed" | ReadOutcome> {
  const words = screenshotCardWords({ host: page.host, sensitive });
  const answer = await waitForCard(progress, (signal) =>
    deps.askShot(words, signal),
  );
  if (answer === "allowed") {
    return "allowed";
  }
  return answer === "declined"
    ? { status: "denied", observed: page.location }
    : stoppedOutcome(progress);
}
