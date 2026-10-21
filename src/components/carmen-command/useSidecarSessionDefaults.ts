import { useEffect, useRef } from "react";
import { useCarmenSkins } from "@/hooks/useCarmenSkins";
import type { BrainChannel } from "./useBrainChannel";

/** Opens the sidecar on Carmen's internal brain and, for a session, her base skin. */
export function useSidecarSessionDefaults(
  brain: BrainChannel,
  session: boolean,
) {
  // The session opens on Carmen's internal brain once; after that the brain
  // selector in the header owns the choice.
  const initialBrainApplied = useRef(false);
  useEffect(() => {
    if (initialBrainApplied.current) return;
    const internal = brain.routes.find((r) => r.slug === "internal");
    if (!internal) return;
    initialBrainApplied.current = true;
    if (brain.selected.slug !== "internal") brain.selectRoute(internal, null);
  }, [brain.routes, brain.selected.slug, brain]);

  // Each session opens on Carmen's base skin; a skin is picked per task.
  const carmenSkins = useCarmenSkins();
  const initialSkinApplied = useRef(false);
  useEffect(() => {
    if (!session || initialSkinApplied.current || carmenSkins.isLoading) return;
    if (!carmenSkins.canEdit) return;
    initialSkinApplied.current = true;
    if (carmenSkins.activeSlug) carmenSkins.setActiveSkin(null).catch(() => {});
  }, [session, carmenSkins]);
}
