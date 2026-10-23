import { useEffect, useState } from "react";
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
import type { BuiltinBrainState } from "./useBrainConnections";

/** Key (and id) for a built-in brain; it overrides the env secret. */
export function BuiltinKeyDialog({
  builtin,
  onOpenChange,
  onSave,
  onReset,
  pending,
}: {
  builtin: BuiltinBrainState | null;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: {
    builtin_slug: string;
    api_key?: string;
    external_id?: string;
  }) => Promise<unknown>;
  onReset: (slug: string) => Promise<unknown>;
  pending: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [externalId, setExternalId] = useState("");

  useEffect(() => {
    setApiKey("");
    setExternalId(builtin?.external_id ?? "");
  }, [builtin]);

  if (!builtin) return null;
  const hasOverride = !!builtin.key_last4 || !!builtin.external_id;
  const idChanged = (builtin.external_id ?? "") !== externalId.trim();
  const canSave = apiKey.trim().length >= 8 || (builtin.id_label && idChanged);

  async function save() {
    await onSave({
      builtin_slug: builtin!.slug,
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      ...(builtin!.id_label ? { external_id: externalId.trim() } : {}),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={!!builtin} onOpenChange={onOpenChange}>
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
                disabled={pending}
                onClick={async () => {
                  await onReset(builtin.slug);
                  onOpenChange(false);
                }}
              >
                חזרה לסוד הסביבה
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!canSave || pending}
              onClick={save}
            >
              {pending ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
