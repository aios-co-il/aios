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
import type { BuiltinBrainState } from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";
import type { useBrainConnections } from "./useBrainConnections";

/**
 * Key (and id) for a built-in brain; it overrides the env secret for this
 * tenant. Mounted only while open, so it starts from the saved id.
 */
export function BuiltinKeyDialog({
  builtin,
  write,
  onClose,
}: {
  builtin: BuiltinBrainState;
  write: ReturnType<typeof useBrainConnections>["write"];
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [externalId, setExternalId] = useState(builtin.external_id ?? "");
  const hasOverride = !!builtin.key_last4 || !!builtin.external_id;
  const idChanged = (builtin.external_id ?? "") !== externalId.trim();
  const canSave =
    apiKey.trim().length >= 8 || (!!builtin.id_label && idChanged);

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
        success: "חזר לסוד הסביבה",
      },
      { onSuccess: onClose },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>מפתח ל-{builtin.label}</DialogTitle>
          <DialogDescription>
            מפתח שנשמר כאן גובר על סוד הסביבה של הפרויקט. בלי מפתח כאן, נעשה
            שימוש בסוד הסביבה ({builtin.env_configured ? "מוגדר" : "לא מוגדר"}).
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
                חזרה לסוד הסביבה
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
