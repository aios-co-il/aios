import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODEL_PRESETS,
  baseUrlProblem,
  presetById,
} from "@/lib/carmenBrainConnections";
import {
  testBrainConnection,
  type BrainConnection,
} from "./useBrainConnections";

type Form = {
  name: string;
  preset: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  temperature: string;
  maxTokens: string;
  description: string;
  color: string;
  showInPicker: boolean;
};

const EMPTY: Form = {
  name: "",
  preset: "openai",
  baseUrl: MODEL_PRESETS[0].base_url,
  model: MODEL_PRESETS[0].models[0],
  apiKey: "",
  systemPrompt: "",
  temperature: "",
  maxTokens: "",
  description: "",
  color: "#7c5cff",
  showInPicker: true,
};

function formFrom(conn: BrainConnection | null): Form {
  if (!conn) return EMPTY;
  const p = conn.profile || {};
  return {
    name: conn.name,
    preset: conn.provider_preset || "custom",
    baseUrl: conn.base_url || "",
    model: conn.model || "",
    apiKey: "",
    systemPrompt: p.system_prompt ?? "",
    temperature: p.temperature !== undefined ? String(p.temperature) : "",
    maxTokens: p.max_tokens !== undefined ? String(p.max_tokens) : "",
    description: p.description ?? "",
    color: p.color ?? "#7c5cff",
    showInPicker: true,
  };
}

function profileOf(f: Form) {
  return {
    system_prompt: f.systemPrompt,
    temperature: f.temperature === "" ? undefined : Number(f.temperature),
    max_tokens: f.maxTokens === "" ? undefined : Number(f.maxTokens),
    description: f.description,
    color: f.color,
  };
}

/** Add or edit a chat-model brain. The key is write-only. */
export function ModelBrainDialog({
  open,
  onOpenChange,
  tenantId,
  connection,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  connection: BrainConnection | null;
  onSubmit: (
    action: "create" | "update" | "set_key",
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  pending: boolean;
}) {
  const editing = !!connection;
  const [f, setF] = useState<Form>(EMPTY);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) setF(formFrom(connection));
  }, [open, connection]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const preset = presetById(f.preset);
  const urlProblem = f.baseUrl ? baseUrlProblem(f.baseUrl) : null;
  const canSave =
    f.name.trim().length >= 2 &&
    !!f.baseUrl &&
    !urlProblem &&
    !!f.model.trim() &&
    (editing || f.apiKey.trim().length >= 8);

  function choosePreset(id: string) {
    const p = presetById(id);
    setF((prev) => ({
      ...prev,
      preset: id,
      baseUrl: p?.base_url || prev.baseUrl,
      model: p?.models[0] || prev.model,
      name: prev.name || (p && p.id !== "custom" ? p.label : prev.name),
    }));
  }

  async function test() {
    setTesting(true);
    const payload =
      editing && !f.apiKey
        ? { connection_id: connection!.id }
        : { base_url: f.baseUrl, model: f.model, api_key: f.apiKey };
    const res = await testBrainConnection(tenantId, payload);
    setTesting(false);
    if (res.ok) toast.success(`החיבור עובד · ${res.reply ?? ""}`);
    else toast.error(res.error || "הבדיקה נכשלה");
  }

  async function save() {
    const common = {
      name: f.name,
      provider_preset: f.preset,
      base_url: f.baseUrl,
      model: f.model,
      profile: profileOf(f),
    };
    if (editing) {
      await onSubmit("update", { connection_id: connection!.id, ...common });
      if (f.apiKey.trim())
        await onSubmit("set_key", {
          connection_id: connection!.id,
          api_key: f.apiKey,
        });
    } else {
      await onSubmit("create", {
        ...common,
        api_key: f.apiKey,
        show_in_picker: f.showInPicker,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "עריכת מוח" : "חיבור מוח חדש"}</DialogTitle>
          <DialogDescription>
            כל מודל עם API תואם OpenAI. המפתח נשמר מוצפן ב-Vault ולא מוצג שוב.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>ספק</Label>
            <Select value={f.preset} onValueChange={choosePreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>שם (כך יופיע בבורר)</Label>
            <Input
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="לדוגמה: GPT קופירייטר"
            />
          </div>

          <div>
            <Label>Base URL</Label>
            <Input
              value={f.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder="https://api.example.com/v1"
              dir="ltr"
            />
            {urlProblem && (
              <p className="mt-1 text-xs text-destructive">{urlProblem}</p>
            )}
          </div>

          <div>
            <Label>מודל</Label>
            <Input
              value={f.model}
              onChange={(e) => set("model", e.target.value)}
              list="brain-model-suggestions"
              dir="ltr"
            />
            <datalist id="brain-model-suggestions">
              {(preset?.models ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div>
            <Label>
              מפתח API{editing ? " (השאירו ריק כדי לשמור את הקיים)" : ""}
            </Label>
            <Input
              type="password"
              autoComplete="off"
              value={f.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              placeholder={
                editing && connection?.key_last4
                  ? `••••${connection.key_last4}`
                  : preset?.key_hint || ""
              }
              dir="ltr"
            />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="text-sm font-medium">פרופיל</div>
            <div>
              <Label>הנחיית מערכת (פרסונה ותפקיד)</Label>
              <Textarea
                rows={4}
                value={f.systemPrompt}
                onChange={(e) => set("systemPrompt", e.target.value)}
                placeholder="אתה מומחה קופירייטינג. ענה בעברית, קצר ולעניין."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>טמפרטורה (0–2)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={2}
                  value={f.temperature}
                  onChange={(e) => set("temperature", e.target.value)}
                  dir="ltr"
                />
              </div>
              <div>
                <Label>מקסימום טוקנים</Label>
                <Input
                  type="number"
                  min={16}
                  max={32000}
                  value={f.maxTokens}
                  onChange={(e) => set("maxTokens", e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            <div>
              <Label>תיאור קצר</Label>
              <Input
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="למה המוח הזה טוב"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="brain-color">צבע בבורר</Label>
              <input
                id="brain-color"
                type="color"
                value={f.color}
                onChange={(e) => set("color", e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border bg-transparent"
              />
            </div>
          </div>

          {!editing && (
            <div className="flex items-center justify-between">
              <Label htmlFor="brain-visible">להציג בבורר המוחות</Label>
              <Switch
                id="brain-visible"
                checked={f.showInPicker}
                onCheckedChange={(v) => set("showInPicker", v)}
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={test}
              disabled={
                testing ||
                !f.baseUrl ||
                !!urlProblem ||
                !f.model ||
                (!editing && f.apiKey.trim().length < 8)
              }
            >
              {testing && <Loader2 className="me-1 h-4 w-4 animate-spin" />}
              בדיקת חיבור
            </Button>
            <Button
              className="flex-1"
              onClick={save}
              disabled={!canSave || pending}
            >
              {pending ? "שומר…" : editing ? "שמירה" : "חיבור"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
