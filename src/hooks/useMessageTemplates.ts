import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export type TemplateChannel = "email" | "whatsapp";

export interface MessageTemplate {
  id: string;
  tenant_id: string;
  name: string;
  channel: TemplateChannel;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  media_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type MessageTemplateInput = Pick<
  MessageTemplate,
  "name" | "channel" | "subject" | "body_html" | "body_text" | "media_url"
>;

export function useMessageTemplates(channel?: TemplateChannel) {
  const { tenantId } = useCurrentTenant();
  const { userId } = useCurrentUser();
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["message-templates", tenantId] });

  const list = useQuery({
    queryKey: ["message-templates", tenantId, channel ?? "all"],
    enabled: !!tenantId,
    queryFn: async (): Promise<MessageTemplate[]> => {
      let q = supabase
        .from("message_templates")
        .select("*")
        .eq("tenant_id", tenantId!)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (channel) q = q.eq("channel", channel);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as MessageTemplate[];
    },
  });

  const save = useMutation({
    mutationFn: async ({
      id,
      ...input
    }: MessageTemplateInput & { id?: string }) => {
      if (id) {
        const { error } = await supabase
          .from("message_templates")
          .update(input)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("message_templates")
        .insert({ ...input, tenant_id: tenantId!, created_by: userId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("message_templates")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const duplicate = useMutation({
    mutationFn: async (t: MessageTemplate) => {
      const { error } = await supabase.from("message_templates").insert({
        tenant_id: tenantId!,
        created_by: userId,
        name: `${t.name} (עותק)`,
        channel: t.channel,
        subject: t.subject,
        body_html: t.body_html,
        body_text: t.body_text,
        media_url: t.media_url,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { list, save, archive, duplicate };
}
