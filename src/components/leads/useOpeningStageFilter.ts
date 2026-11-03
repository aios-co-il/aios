import { useCallback, useEffect, useRef } from "react";
import type { LeadViewMode } from "@/lib/leadViewMode";
import { decideOpeningStage, type LeadStageScope } from "./leadStageScope";

/**
 * Applies the opening stage filter once per tenant and view. Later filter
 * changes in the same view, such as "reset all", never bring it back.
 * `markUserChoice` records a stage or preset the user picked, so a later view
 * keeps it instead of re-applying the default.
 */
export function useOpeningStageFilter(input: {
  tenantId: string | null | undefined;
  viewMode: LeadViewMode;
  savedScope: LeadStageScope | null;
  isSettled: boolean;
  hasFilterOrPreset: boolean;
  firstStageKey: string | undefined;
  applyStage: (stageKey: string) => void;
}) {
  const {
    tenantId,
    viewMode,
    savedScope,
    isSettled,
    hasFilterOrPreset,
    firstStageKey,
    applyStage,
  } = input;
  const handledFor = useRef<string | null>(null);
  const userChose = useRef(false);

  useEffect(() => {
    // Wait for the saved default so a late answer never overrides the opening.
    if (!isSettled) {
      return;
    }
    const openingKey = `${tenantId ?? ""}:${viewMode}`;
    if (handledFor.current === openingKey) {
      return;
    }
    // Without a saved default, each return to chat re-opens on new leads.
    if (savedScope === null && viewMode !== "chat") {
      userChose.current = false;
    }
    const decision = decideOpeningStage({
      savedScope,
      viewMode,
      userChoseFilter: userChose.current || hasFilterOrPreset,
      firstStageKey,
    });
    if (decision.kind === "wait") {
      return;
    }
    handledFor.current = openingKey;
    if (decision.kind === "apply") {
      applyStage(decision.stageKey);
    }
  }, [
    tenantId,
    viewMode,
    savedScope,
    isSettled,
    hasFilterOrPreset,
    firstStageKey,
    applyStage,
  ]);

  const markUserChoice = useCallback(() => {
    userChose.current = true;
  }, []);

  return { markUserChoice };
}
