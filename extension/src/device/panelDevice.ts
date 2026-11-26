/**
 * Wires the panel's read, navigate, click, type and screenshot actions to Chrome, the panel's card and carmen-device-action.
 * The decisions live in the modules this file passes them to.
 */
import {
  panelActionRef,
  PANEL_MESSAGE,
  type PanelMessage,
} from "../../../supabase/functions/_shared/carmen/device/panel-envelope.ts";
import {
  APP_ORIGIN,
  SUPABASE_ANON_KEY,
  SUPABASE_ORIGINS,
  SUPABASE_URL,
} from "../config";
import { isTabShared } from "../activeTab";
import { supabase } from "../supabase";
import {
  activeTab,
  hasSiteGrant,
  navigateTab,
  readPage,
  requestSiteGrant,
  tabById,
} from "./chromeDevice.ts";
import {
  actOnTarget,
  holdsSnapshot,
  inspectTarget,
  settleTab,
} from "./chromeAct.ts";
import {
  captureTab,
  dropCaptureGrant,
  pageFields,
  requestCaptureGrant,
  uploadShot,
} from "./chromeShot.ts";
import { deviceActionApi } from "./deviceActionApi.ts";
import { navigateCardWords } from "./cardWords.ts";
import {
  askActOnCard,
  askGrantOnCard,
  askOnCard,
  type GrantCardElements,
} from "./grantCard.ts";
import { createReadActions, type ReadActions } from "./readActions.ts";

/** The read actions of this panel; `post` sends a message to the framed site. */
export function panelReadActions(
  post: (message: PanelMessage) => void,
): ReadActions {
  const card = grantCardElements();
  const api = deviceActionApi({
    supabaseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_ANON_KEY,
    accessToken: accessToken,
    fetch: (...request) => fetch(...request),
  });

  return createReadActions({
    ...api,
    origins: { appOrigins: [APP_ORIGIN], backendOrigins: SUPABASE_ORIGINS },
    isTabShared,
    activeTab,
    tab: tabById,
    hasGrant: hasSiteGrant,
    askGrant: (site, signal) =>
      askGrantOnCard(card, site, signal, requestSiteGrant),
    // Moving the tab needs no Chrome permission: the tap on the card is the whole answer.
    askNavigate: (step, signal) =>
      askOnCard(card, navigateCardWords(step), signal, async () => true),
    navigateTab,
    // Clicking and typing need no new Chrome permission: the read's site grant covers them.
    askAct: (words, signal) => askActOnCard(card, words, signal),
    inspectTarget,
    actOnTarget,
    settleTab,
    holdsSnapshot,
    // Chrome captures only with the capture grant, asked for from the card's tap.
    askShot: (words, signal) =>
      askOnCard(card, words, signal, requestCaptureGrant),
    dropCaptureGrant,
    pageFields,
    captureTab,
    uploadShot,
    readPage,
    newSnapshotId: () => crypto.randomUUID(),
    postResult: (id) => post(panelActionRef(PANEL_MESSAGE.result, id)),
    setTimer: (run, ms) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
  });
}

/** The card's elements, as sidepanel.html declares them. */
function grantCardElements(): GrantCardElements {
  return {
    card: element("grant-card", HTMLElement),
    title: element("grant-title", HTMLElement),
    address: element("grant-address", HTMLElement),
    quote: element("grant-quote", HTMLElement),
    text: element("grant-text", HTMLElement),
    trust: element("grant-trust", HTMLElement),
    trustBox: element("grant-trust-box", HTMLInputElement),
    trustLabel: element("grant-trust-label", HTMLElement),
    allow: element("grant-allow", HTMLButtonElement),
    decline: element("grant-decline", HTMLButtonElement),
  };
}

/** One element of the panel's page; a missing one is a build error worth stopping on. */
function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) {
    throw new Error(`sidepanel.html has no ${id}`);
  }
  return found;
}

/** The extension's signed-in user's token: the popup's sign-in, which must be the site's user for a claim to pass. */
async function accessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[carmen-panel] reading the session failed", error);
  }
  return data.session?.access_token ?? null;
}
