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

export function setSessionSkin(
  tenantId: string | null | undefined,
  slug: string | null,
) {
  if (!tenantId || getSessionSkin(tenantId) === slug) return;
  if (slug) skins.set(tenantId, slug);
  else skins.delete(tenantId);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionSkin(tenantId: string | null | undefined) {
  return useSyncExternalStore(subscribe, () => getSessionSkin(tenantId));
}
