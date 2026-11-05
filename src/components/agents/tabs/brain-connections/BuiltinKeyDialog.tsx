import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  BuiltinBrainState,
  TenantRef,
} from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";
import { BuiltinShareSection } from "./BuiltinShareSection";
import type { useBrainConnections } from "./useBrainConnections";

/** What this tenant runs on when it has no key of its own. */
const FALLBACK_TEXT: Record<string, string> = {
  shared: "המפתח המשותף",
  project: "מפתח הפרויקט",
};

/**
 * This tenant's own key and id for a built-in brain, saved only as a pair,
 * and who it is shared with. Mounted only while open, so it starts from the
 * saved id.
 */
export function BuiltinKeyDialog({
  builtin,
  shareTargets,
  write,
  onClose,
}: {
  builtin: BuiltinBrainState;
  shareTargets: TenantRef[];
  write: ReturnType<typeof useBrainConnections>["write"];
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [externalId, setExternalId] = useState(builtin.external_id ?? "");
  const hasOverride = !!builtin.key_last4 || !!builtin.external_id;
  const idChanged = (builtin.external_id ?? "") !== externalId.trim();
  // A key needs its id and an id needs its key, so a send never mixes sources.
  const hasKey = apiKey.trim().length >= 8 || !!builtin.key_last4;
  const hasId = !builtin.id_label || !!externalId.trim();
  const changed = !!apiKey.trim() || (!!builtin.id_label && idChanged);
  const canSave = hasKey && hasId && changed;
  const fallback =
    builtin.source === "shared"
      ? `${FALLBACK_TEXT.shared} מ-${builtin.shared_from?.name ?? ""}`
      : (FALLBACK_TEXT[builtin.source ?? ""] ?? "המוח לא מוגדר");

  const save = () =>
    write.mutate(
      {
        action: "set_builtin",
        payload: {
          builtin_slug: builtin.slug,
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          ...(builtin.id_label && idChanged
            ? { external_id: externalId.trim() }
            : {}),
        },
        success: "המפתח נשמר",
      },
      { onSuccess: onClose },
    );
  const reset = () =>
    write.mutate(
      {
        action: "reset_builtin",
        payload: { builtin_slug: builtin.slug },
        success: "המפתח של הארגון נמחק",
      },
      { onSuccess: onClose },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>מפתח ל-{builtin.label}</DialogTitle>
          <DialogDescription>
            מפתח שנשמר כאן משמש רק את הארגון הזה
            {builtin.id_label ? `, ונשמר יחד עם ה-${builtin.id_label}` : ""}.
            {builtin.source !== "own" && ` כרגע: ${fallback}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {builtin.id_label && (
            <div>
              <Label>{builtin.id_label}</Label>
              <Input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                dir="ltr"
              />
            </div>
          )}
          <div>
            <Label>מפתח / טוקן</Label>
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                builtin.key_last4 ? `••••${builtin.key_last4}` : "הדביקו מפתח"
              }
              dir="ltr"
            />
          </div>
          <div className="flex gap-2">
            {hasOverride && (
              <Button
                variant="outline"
                disabled={write.isPending}
                onClick={reset}
              >
                מחיקת המפתח של הארגון
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!canSave || write.isPending}
              onClick={save}
            >
              {write.isPending ? "שומר…" : "שמירה"}
            </Button>
          </div>
          {builtin.can_share && shareTargets.length > 0 && (
            <BuiltinShareSection
              builtin={builtin}
              shareTargets={shareTargets}
              write={write}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
