import { useSyncExternalStore } from "react";

/**
 * The skin chosen in this browser's Carmen session, per tenant. It lives in
 * memory only: it never touches Carmen's shared agent row, so one user's
 * choice does not change Carmen for anyone else, and a reload starts on the
 * base skin. Sent with each chat request as `active_skin`.
 */
const skins = new Map<string, string>();
const listeners = new Set<() => void>();

export function getSessionSkin(tenantId: string | null | undefined) {
  return (tenantId && skins.get(tenantId)) || null;
}

/** Skins the workshop switched to (its role skins), with the skin the session had before. */
const lent = new Map<string, { before: string | null; slug: string }>();

function apply(tenantId: string, slug: string | null) {
  if (getSessionSkin(tenantId) === slug) return;
  if (slug) skins.set(tenantId, slug);
  else skins.delete(tenantId);
  listeners.forEach((l) => l());
}

/** The user's own choice; it is kept after the workshop closes. */
export function setSessionSkin(
  tenantId: string | null | undefined,
  slug: string | null,
) {
  if (!tenantId) return;
  lent.delete(tenantId);
  apply(tenantId, slug);
}

/**
 * The workshop switched Carmen to one of its role skins (a server `skin` event). It lasts
 * while the workshop is open: releaseWorkshopSkins puts the session's own skin back.
 */
export function setWorkshopSkin(
  tenantId: string | null | undefined,
  slug: string,
) {
  if (!tenantId) return;
  const held = lent.get(tenantId);
  lent.set(tenantId, {
    before: held ? held.before : getSessionSkin(tenantId),
    slug,
  });
  apply(tenantId, slug);
}

/** The workshop closed: a role skin it switched to gives way to the skin the session had. */
export function releaseWorkshopSkins() {
  for (const [tenantId, { before, slug }] of lent)
    if (getSessionSkin(tenantId) === slug) apply(tenantId, before);
  lent.clear();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionSkin(tenantId: string | null | undefined) {
  return useSyncExternalStore(subscribe, () => getSessionSkin(tenantId));
}
