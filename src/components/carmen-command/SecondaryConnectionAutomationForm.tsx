import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Quick create: a Carmen WhatsApp-session automation pinned to one
 * (secondary) connection, with its own trigger words and instructions.
 * Replies go back on the same connection (no send step = inbound transport).
 */
export function SecondaryConnectionAutomationForm({
  tenantId,
  integration,
  onDone,
}: {
  tenantId: string | null;
  integration: { id: string; display_name?: string | null };
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(
    `כרמן בטלפון ${integration.display_name || ""}`.trim(),
  );
  const [keywords, setKeywords] = useState("כרמן");
  const [instructions, setInstructions] = useState("");
  const [allowedPhones, setAllowedPhones] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("אין ארגון פעיל");
      const triggerKeywords = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (!triggerKeywords.length) throw new Error("חסרה מילת טריגר");
      const phones = allowedPhones
        .split(/[,\s]+/)
        .map((p) => p.replace(/\D/g, ""))
        .filter((p) => p.length >= 9);

      const { data: automation, error } = await supabase
        .from("automations")
        .insert({
          name: name.trim() || "כרמן בחיבור משני",
          description: "כרמן בחיבור משני — רק עם מילת טריגר",
          tenant_id: tenantId,
          trigger_type: "whatsapp_message_received",
          action_type: "send_greenapi_message",
          configuration: { carmen_session_mode: true },
          is_flow: true,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: stepError } = await supabase
        .from("automation_flow_steps")
        .insert({
          automation_id: automation.id,
          tenant_id: tenantId,
          step_type: "trigger",
          action_type: "carmen_whatsapp_session",
          label: "שיחת כרמן ב-WhatsApp",
          sort_order: 0,
          configuration: {
            carmen_integration_id: integration.id,
            trigger_keywords: triggerKeywords,
            end_keyword: "סיימנו",
            session_timeout_minutes: 30,
            carmen_instructions: instructions.trim().slice(0, 2000) || null,
            // Only the phone owner, unless specific contacts are allowed.
            carmen_scope_mode: phones.length ? "specific_phone" : "all",
            carmen_allowed_phones: phones,
          },
        });
      if (stepError) {
        await supabase.from("automations").delete().eq("id", automation.id);
        throw stepError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carmen-automations", tenantId] });
      toast.success("האוטומציה נוצרה ומוצמדת לחיבור");
      onDone();
    },
    onError: (e) => toast.error(e?.message ?? String(e)),
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" dir="rtl">
      <div className="space-y-1">
        <Label>שם</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>מילות טריגר (מופרדות בפסיק)</Label>
        <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>הנחיות לשיחות האלה</Label>
        <Textarea
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="למשל: עני לי בקצרה, רק על לידים ודוחות, ואל תבצעי פעולות בלי אישור."
        />
      </div>
      <div className="space-y-1">
        <Label>אנשי קשר נוספים שמותר להם (אופציונלי)</Label>
        <Input
          dir="ltr"
          value={allowedPhones}
          onChange={(e) => setAllowedPhones(e.target.value)}
          placeholder="972501234567, 972521234567"
        />
        <p className="text-xs text-muted-foreground">
          ריק = רק את/ה, מהטלפון הזה. כרמן עונה רק להודעה שמכילה את מילת הטריגר.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          צור אוטומציה
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          ביטול
        </Button>
      </div>
    </div>
  );
}
