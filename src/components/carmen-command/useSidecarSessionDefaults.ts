import { useEffect, useRef } from "react";
import { useCarmenSkins } from "@/hooks/useCarmenSkins";

/**
 * Opens a session on Carmen's base skin. The brain it opens on is the user's
 * stored pick, applied where the chat lives (choices/useApplyBrainPick).
 */
export function useSidecarSessionDefaults(session: boolean) {
  // Each session opens on Carmen's base skin; a skin is picked per task.
  const carmenSkins = useCarmenSkins();
  const initialSkinApplied = useRef(false);
  useEffect(() => {
    if (!session || initialSkinApplied.current) {
      return;
    }
    initialSkinApplied.current = true;
    if (carmenSkins.activeSlug) {
      carmenSkins.setActiveSkin(null).catch(() => {});
    }
  }, [session, carmenSkins]);
}
