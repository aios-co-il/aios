import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BrainConnection } from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";
import { ModelBrainEndpointFields } from "./ModelBrainEndpointFields";
import { ModelBrainProfileFields } from "./ModelBrainProfileFields";
import {
  canSave,
  canTest,
  formFor,
  type ModelBrainForm,
  profileOf,
  withPreset,
} from "./modelBrainForm";
import {
  type useBrainConnections,
  useTestBrainConnection,
} from "./useBrainConnections";

/**
 * Add or edit a chat-model brain. Mounted only while open, so each opening
 * starts from the connection's saved values.
 */
export function ModelBrainDialog({
  tenantId,
  connection,
  write,
  onClose,
}: {
  tenantId: string;
  connection: BrainConnection | null;
  write: ReturnType<typeof useBrainConnections>["write"];
  onClose: () => void;
}) {
  const editing = !!connection;
  const [f, setF] = useState<ModelBrainForm>(() => formFor(connection));
  const test = useTestBrainConnection(tenantId);
  const set = <K extends keyof ModelBrainForm>(k: K, v: ModelBrainForm[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const fields = {
    name: f.name,
    provider_preset: f.preset,
    base_url: f.baseUrl,
    model: f.model,
    profile: profileOf(f),
    ...(f.apiKey.trim() ? { api_key: f.apiKey.trim() } : {}),
  };
  const save = () =>
    write.mutate(
      editing
        ? {
            action: "update",
            payload: { connection_id: connection.id, ...fields },
            success: "נשמר",
          }
        : {
            action: "create",
            payload: { ...fields, active: f.active },
            success: "המוח חובר ונוסף לבורר",
          },
      { onSuccess: onClose },
    );
  const runTest = () =>
    test.mutate(
      editing && !f.apiKey.trim()
        ? { connection_id: connection.id }
        : { base_url: f.baseUrl, model: f.model, api_key: f.apiKey.trim() },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "עריכת מוח" : "חיבור מוח חדש"}</DialogTitle>
          <DialogDescription>
            כל מודל עם API תואם OpenAI. המפתח נשמר מוצפן ב-Vault ולא מוצג שוב.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ModelBrainEndpointFields
            f={f}
            set={set}
            onPreset={(id) => setF((prev) => withPreset(prev, id))}
            savedKeyLast4={editing ? connection.key_last4 : undefined}
          />
          <ModelBrainProfileFields f={f} set={set} />
          {!editing && (
            <div className="flex items-center justify-between">
              <Label htmlFor="brain-active">מופיע בבורר</Label>
              <Switch
                id="brain-active"
                checked={f.active}
                onCheckedChange={(v) => set("active", v)}
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={runTest}
              disabled={test.isPending || !canTest(f, editing)}
            >
              {test.isPending && (
                <Loader2 className="me-1 h-4 w-4 animate-spin" />
              )}
              בדיקת חיבור
            </Button>
            <Button
              className="flex-1"
              onClick={save}
              disabled={!canSave(f, editing) || write.isPending}
            >
              {write.isPending ? "שומר…" : editing ? "שמירה" : "חיבור"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
