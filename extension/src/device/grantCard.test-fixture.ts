import type { CardWords } from "./cardWords.ts";
import type { GrantAnswer } from "./readFlow.ts";

/** A controllable card: resolves when the test answers, or when the step is stopped. */
export type FakeCard = {
  shown: Array<{ host: string; pattern: string }>;
  /** The navigation cards shown, in order. */
  navigations: Array<{ fromHost: string; host: string; href: string }>;
  /** The click and typing cards shown, in order. */
  acts: Array<CardWords>;
  /** Taps the card; `trustSite`: "trust this site" was ticked (click and typing cards). */
  answer: (answer: GrantAnswer, trustSite?: boolean) => void;
};
