/**
 * A fake Chrome, card and carmen-device-action for the read, navigate, click and type tests: each call is
 * recorded, and each answer can be replaced per test.
 */
import { vi } from "vitest";
import type { CardWords } from "./cardWords.ts";
import type { CompleteBody } from "./completion.ts";
import type { ActCardAnswer } from "./grantCard.ts";
import type { ClaimAnswer, ReadActionDeps } from "./readActions.ts";
import type { GrantAnswer, TabFacts } from "./readFlow.ts";

export const ACTION_ID = "0b5e8f7a-3c1d-4e2f-9a8b-7c6d5e4f3a2b";
export const PAGE_URL = "https://shop.example/items?token=secret";

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

/** The fake deps plus the handles a test inspects. */
export type FakeDevice = {
  deps: ReadActionDeps;
  completed: Array<CompleteBody>;
  closingCompletions: Array<CompleteBody>;
  posted: Array<string>;
  card: FakeCard;
  /** The tab's address from now on, as Chrome would report it. */
  setTabUrl: (url: string | undefined) => void;
  /** The address the tab is loading, as Chrome reports it until the load commits. */
  setPendingUrl: (url: string | undefined) => void;
  /** The id of the active tab from now on; the read's tab stays 7. */
  setActiveTabId: (id: number) => void;
  /** Fires the expiry timer. */
  expire: () => void;
  /** Where a navigation lands from now on: a redirect; by default its own destination. */
  setLandingUrl: (url: string) => void;
  /** The tab's addresses each navigation was asked for. */
  navigatedTo: Array<{ tabId: number; url: string }>;
};

/** A fake device on a granted https page, with a claim that succeeds for a read. */
export function fakeDevice(
  overrides: Partial<ReadActionDeps> = {},
): FakeDevice {
  let tabUrl: string | undefined = PAGE_URL;
  let pendingUrl: string | undefined;
  let activeTabId = 7;
  let expiry: (() => void) | null = null;
  let answerCard: ((answer: GrantAnswer, trustSite: boolean) => void) | null =
    null;
  let landingUrl: string | null = null;
  const navigatedTo: Array<{ tabId: number; url: string }> = [];
  const completed: Array<CompleteBody> = [];
  const closingCompletions: Array<CompleteBody> = [];
  const posted: Array<string> = [];
  const card: FakeCard = {
    shown: [],
    navigations: [],
    acts: [],
    answer: (answer, trustSite = false) => answerCard?.(answer, trustSite),
  };

  /** The tab as Chrome reports it now. */
  function currentTab(id = 7): TabFacts {
    return { id, url: tabUrl, pendingUrl, title: "Items | Shop" };
  }

  const deps: ReadActionDeps = {
    origins: {
      appOrigins: ["https://aios.co.il"],
      backendOrigins: ["https://api.aios.co.il"],
    },
    claim: vi.fn(async (): Promise<ClaimAnswer> => ({
      ok: true,
      tool: "browser_read_page",
      trustedOrigin: null,
      conversationId: null,
    })),
    complete: vi.fn(async (body: CompleteBody) => {
      completed.push(body);
    }),
    completeOnClose: vi.fn((body: CompleteBody) => {
      closingCompletions.push(body);
    }),
    postResult: vi.fn((id: string) => {
      posted.push(id);
    }),
    isTabShared: vi.fn(async () => true),
    activeTab: vi.fn(async () => currentTab(activeTabId)),
    tab: vi.fn(async () => currentTab()),
    hasGrant: vi.fn(async () => true),
    askGrant: vi.fn(
      (site: { host: string; pattern: string }, signal: AbortSignal) =>
        new Promise<GrantAnswer>((resolve) => {
          card.shown.push(site);
          answerCard = resolve;
          signal.addEventListener("abort", () => resolve("stopped"));
        }),
    ),
    askNavigate: vi.fn(
      (
        step: { fromHost: string; host: string; href: string },
        signal: AbortSignal,
      ) =>
        new Promise<GrantAnswer>((resolve) => {
          card.navigations.push(step);
          answerCard = resolve;
          signal.addEventListener("abort", () => resolve("stopped"));
        }),
    ),
    navigateTab: vi.fn(async (tabId: number, url: string) => {
      navigatedTo.push({ tabId, url });
      tabUrl = landingUrl ?? url;
    }),
    readPage: vi.fn(async () => ({
      origin: "https://shop.example",
      text: "Item one  costs 10",
      elements: [{ role: "button", name: "Buy" }],
    })),
    newSnapshotId: () => "snapshot-1",
    askAct: vi.fn(
      (words: CardWords, signal: AbortSignal) =>
        new Promise<ActCardAnswer>((resolve) => {
          card.acts.push(words);
          answerCard = (answer, trustSite) => resolve({ answer, trustSite });
          signal.addEventListener("abort", () =>
            resolve({ answer: "stopped", trustSite: false }),
          );
        }),
    ),
    inspectTarget: vi.fn(async () => ({ documentId: "doc-1", answer: null })),
    actOnTarget: vi.fn(async () => null),
    settleTab: vi.fn(async () => {}),
    holdsSnapshot: vi.fn(async () => true),
    setTimer: (run: () => void) => {
      expiry = run;
      return () => {
        expiry = null;
      };
    },
    ...overrides,
  };

  return {
    deps,
    completed,
    closingCompletions,
    posted,
    card,
    setTabUrl: (url) => {
      tabUrl = url;
    },
    setPendingUrl: (url) => {
      pendingUrl = url;
    },
    setActiveTabId: (id) => {
      activeTabId = id;
    },
    expire: () => expiry?.(),
    setLandingUrl: (url) => {
      landingUrl = url;
    },
    navigatedTo,
  };
}

/** Lets every pending promise callback run, so a step reaches its next wait. */
export async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
