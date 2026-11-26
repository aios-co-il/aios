/**
 * Wires the panel's read actions to Chrome, the panel's card and carmen-device-action.
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
import { supabase } from "../supabase";
import {
  activeTab,
  hasSiteGrant,
  readPage,
  requestSiteGrant,
  tabById,
} from "./chromeDevice.ts";
import { deviceActionApi } from "./deviceActionApi.ts";
import { askGrantOnCard, type GrantCardElements } from "./grantCard.ts";
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
    activeTab,
    tab: tabById,
    hasGrant: hasSiteGrant,
    askGrant: (site, signal) =>
      askGrantOnCard(card, site, signal, requestSiteGrant),
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
