import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  useCarmenIdentity,
  readAgentIdentity,
} from "@/hooks/useCarmenIdentity";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Agent = {
  id: string;
  tenant_id: string;
  name: string;
  metadata?: unknown;
};
export function AgentVisualIdentity({ agent }: { agent: Agent }) {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  const identity = useCarmenIdentity();
  const [draft, setDraft] = useState(() => ({
    ...readAgentIdentity(agent.metadata),
    displayName: readAgentIdentity(agent.metadata).displayName || agent.name,
  }));
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      setDraft({
        ...readAgentIdentity(agent.metadata),
        displayName:
          readAgentIdentity(agent.metadata).displayName || agent.name,
      }),
    [agent.id, agent.metadata, agent.name],
  );
  async function createImage(file?: File) {
    if (tenantId !== agent.tenant_id || (!file && !draft.prompt?.trim()))
      return;
    if (
      file &&
      (!/^image\/(png|jpeg|webp)$/.test(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      toast.error("יש לבחור PNG, JPG או WebP עד 5MB");
      return;
    }
    setBusy(true);
    try {
      let imageData: string | undefined;
      if (file)
        imageData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      const { data, error } = await supabase.functions.invoke(
        "agent-profile-avatar",
        {
          body: {
            tenantId,
            agentId: agent.id,
            prompt: draft.prompt,
            imageData,
          },
        },
      );
      if (error || data?.error || !data?.avatar_url)
        throw new Error(data?.error || error?.message || "יצירת התמונה נכשלה");
      setDraft((current) => ({
        ...current,
        avatarUrl: data.avatar_url,
        avatarPath: data.avatar_path,
      }));
      toast.success("התמונה מוכנה לתצוגה מקדימה. לחץ שמירה כדי להחיל");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "יצירת התמונה נכשלה",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (tenantId !== agent.tenant_id || !draft.displayName?.trim()) return;
    setBusy(true);
    try {
      const { data: latest, error: readError } = await supabase
        .from("ai_agents")
        .select("metadata")
        .eq("id", agent.id)
        .eq("tenant_id", tenantId)
        .single();
      if (readError) throw readError;
      const metadata =
        latest.metadata &&
        typeof latest.metadata === "object" &&
        !Array.isArray(latest.metadata)
          ? latest.metadata
          : {};
      const { error } = await supabase
        .from("ai_agents")
        .update({
          metadata: {
            ...metadata,
            visual_identity: {
              ...draft,
              avatarUrl: draft.avatarPath ? null : draft.avatarUrl || null,
              displayName: draft.displayName.trim(),
            },
          },
        })
        .eq("id", agent.id)
        .eq("tenant_id", tenantId)
        .select("id")
        .single();
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ai-agents", tenantId] }),
        qc.invalidateQueries({ queryKey: ["carmen-identity", tenantId] }),
      ]);
      toast.success("השם והתמונה נשמרו לארגון הזה");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5 space-y-4" dir="rtl">
      <div>
        <h3 className="font-semibold">השם והדמות בארגון שלך</h3>
        <p className="text-sm text-muted-foreground">
          בחר שם ותמונה משלך. השינויים חלים על הארגון הנוכחי.
        </p>
      </div>
      <div className="flex items-center gap-8 flex-wrap">
        <CarmenPortrait
          image={
            draft.avatarUrl || (draft.avatarPath ? identity.image : undefined)
          }
          custom={!!(draft.avatarUrl || draft.avatarPath)}
          name={draft.displayName || agent.name}
          className="carmen-portrait-large"
        />
        <div className="flex-1 min-w-48">
          <Label htmlFor="agent-display-name">שם לתצוגה</Label>
          <Input
            id="agent-display-name"
            maxLength={60}
            value={draft.displayName ?? agent.name}
            disabled={busy}
            onChange={(e) =>
              setDraft({ ...draft, displayName: e.target.value })
            }
          />
        </div>
      </div>
      <Label htmlFor="agent-profile-upload">העלאת תמונה</Label>
      <Input
        id="agent-profile-upload"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void createImage(file);
          e.target.value = "";
        }}
      />
      <Label htmlFor="agent-image-prompt">יצירת דמות לפי תיאור</Label>
      <Textarea
        id="agent-image-prompt"
        value={draft.prompt || ""}
        disabled={busy}
        maxLength={2000}
        placeholder="תארו את הדמות, הסגנון, הלבוש והצבעים…"
        onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
      />
      <p className="text-xs text-muted-foreground">
        היצירה מכוונת לדמות עם רקע שקוף, תאורה ועומק, כדי שתבלוט מעל המסגרת.
        יצירת תמונה צורכת שימוש במנוע התמונות.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !draft.prompt?.trim()}
          onClick={() => void createImage()}
        >
          {busy ? "מעבד…" : "יצירת תמונת פרופיל"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            setDraft({ ...draft, avatarUrl: undefined, avatarPath: undefined })
          }
        >
          תמונת ברירת מחדל
        </Button>
        <Button
          type="button"
          disabled={busy || !(draft.displayName ?? agent.name).trim()}
          onClick={() => void save()}
        >
          שמירת שם ותמונה
        </Button>
      </div>
    </Card>
  );
}
