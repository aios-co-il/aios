import { useEffect } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const settingText = z.string().min(1).optional().catch(undefined);

const senderSettingsSchema = z
  .object({
    instance_id: z.unknown(),
    instance_name: settingText,
    connection_name: settingText,
  })
  .catch({});

interface Props {
  tenantId: string | undefined;
  /** selected tenant_integrations.id, or "" for auto (server-side default) */
  value: string;
  onChange: (id: string) => void;
}

/**
 * Lets the user choose which WhatsApp sender (green_api instance) a report/dashboard
 * goes out from — mirroring the sender selection in the broadcast wizard.
 * Renders nothing when there is 0 or 1 instance (no real choice); in that case the
 * send call omits integrationId and the edge function keeps its existing auto-pick,
 * so nothing changes for tenants with a single number.
 */
export function ReportWhatsAppSenderSelect({
  tenantId,
  value,
  onChange,
}: Props) {
  const { data: instances = [] } = useQuery({
    queryKey: ["green-api-instances", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_integrations")
        .select("id, display_name, settings")
        .eq("tenant_id", tenantId!)
        .eq("integration_type", "green_api")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // Default to the first instance once options load (only when a choice exists).
  useEffect(() => {
    if (instances.length > 1 && !value) onChange(instances[0].id);
  }, [instances, value, onChange]);

  if (instances.length <= 1) return null;

  const labelFor = (i: (typeof instances)[number]): string => {
    const settings = senderSettingsSchema.parse(i.settings);
    const instanceId = settings.instance_id;
    return (
      i.display_name ||
      settings.instance_name ||
      settings.connection_name ||
      (instanceId ? `WhatsApp ··${String(instanceId).slice(-4)}` : "WhatsApp")
    );
  };

  return (
    <div className="space-y-1" dir="rtl">
      <Label className="text-xs text-muted-foreground">שלח מ (WhatsApp)</Label>
      <Select value={value || instances[0].id} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {instances.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {labelFor(i)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
