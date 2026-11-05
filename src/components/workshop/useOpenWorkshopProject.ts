import { useSyncExternalStore } from "react";
import {
  getWorkshopContext,
  subscribeWorkshopContext,
} from "@/lib/workshopBridge";

/**
 * The project open on the workshop board, for Carmen's chat (which lives in another part of the
 * page); null while no workshop project is open.
 */
export function useOpenWorkshopProject(): string | null {
  return useSyncExternalStore(
    subscribeWorkshopContext,
    () => getWorkshopContext()?.projectId ?? null,
  );
}
