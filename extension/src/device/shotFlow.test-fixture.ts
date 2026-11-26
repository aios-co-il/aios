/**
 * A fake screenshot for the panel tests (AIO-656): the Chrome and storage calls of a picture,
 * each recorded, and a screenshot card a test answers.
 */
import { vi } from "vitest";
import type { CardWords } from "./cardWords.ts";
import type { GrantAnswer } from "./readFlow.ts";
import type { ShotDeps } from "./shotFlow.ts";

/** The signed-in user whose folder a screenshot is stored in. */
export const SHOT_OWNER = "11111111-1111-4111-8111-111111111111";

/** A claim's answer with no trust and no screenshot permission: what the server sends for most steps. */
export const NO_CLAIM_FACTS = {
  trustedOrigin: null,
  conversationId: null,
  sensitiveScreenshotsAllowed: false,
} as const;

/** The screenshot cards shown, in order, the tap on the latest, and every return of the capture grant. */
export type ShotCard = {
  shown: Array<CardWords>;
  answer: (answer: GrantAnswer) => void;
  drops: number;
};

/** The screenshot calls of a device on a page with no fields; `card` records and answers the screenshot card. */
export function shotDeps(card?: ShotCard): Omit<ShotDeps, keyof ShotBase> {
  let answerCard: ((answer: GrantAnswer) => void) | null = null;
  if (card) {
    card.answer = (answer) => answerCard?.(answer);
  }

  return {
    askShot: vi.fn(
      (words: CardWords, signal: AbortSignal) =>
        new Promise<GrantAnswer>((resolve) => {
          card?.shown.push(words);
          answerCard = resolve;
          signal.addEventListener("abort", () => resolve("stopped"));
        }),
    ),
    dropCaptureGrant: vi.fn(async () => {
      if (card) {
        card.drops += 1;
      }
    }),
    pageFields: vi.fn(async () => [[]]),
    captureTab: vi.fn(async () => "data:image/jpeg;base64,/9j/4AAQ"),
    uploadShot: vi.fn(async () => `${SHOT_OWNER}/1764150000000-tab.jpg`),
  };
}

/** The calls a screenshot shares with a read. */
type ShotBase = Pick<
  ShotDeps,
  "origins" | "isTabShared" | "activeTab" | "tab" | "hasGrant"
>;
