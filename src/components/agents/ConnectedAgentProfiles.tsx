import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Pencil, Plug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  signProfileImage,
  uploadProfileImage,
  validateAvatarFile,
} from "@/lib/profileAvatars";
import { AGENT_SPRITES, type AgentSeatKey } from "@/lib/agentSeats";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Profiles for connected (external) agents — Cursor, Grok, Claude, Codex… — kept in
// agent_brain_routes.config.profile, which is already tenant-scoped by RLS.

type Profile = {
  displayName?: string;
  persona?: string;
  instructions?: string;
  avatarPath?: string;
};
type RouteRow = {
  id: string;
  slug: string;
  label: string;
  route_type: string;
  config: Record<string, any> | null;
  avatarUrl?: string;
};

const readProfile = (config: RouteRow["config"]): Profile => {
  const p = config?.profile;
  if (!p || typeof p !== "object") return {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    displayName: str(p.displayName),
    persona: str(p.persona),
    instructions: str(p.instructions),
    avatarPath: str(p.avatarPath),
  };
};

function Avatar({ route }: { route: RouteRow }) {
  const fallback = AGENT_SPRITES[route.slug as AgentSeatKey];
  const src = route.avatarUrl || fallback;
  return src ? (
    <img src={src} alt="" className="h-12 w-12 rounded-full object-cover" />
  ) : (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Plug className="h-5 w-5" />
    </span>
  );
}

export function ConnectedAgentProfiles() {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [draft, setDraft] = useState<Profile>({});
  const [file, setFile] = useState<File | null>(null);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["connected-agent-profiles", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<RouteRow[]> => {
      const { data, error } = await supabase
        .from("agent_brain_routes")
        .select("id,slug,label,route_type,config")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .eq("route_type", "direct_channel")
        .order("label");
      if (error) throw error;
      return Promise.all(
        ((data as RouteRow[]) ?? []).map(async (r) => ({
          ...r,
          avatarUrl: await signProfileImage(
            tenantId!,
            readProfile(r.config).avatarPath,
          ),
        })),
      );
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing || !tenantId) return;
      let avatarPath = draft.avatarPath;
      if (file)
        avatarPath = await uploadProfileImage(
          tenantId,
          `routes/${editing.id}`,
          file,
        );
      // Re-read config so provider settings written elsewhere are preserved.
      const { data: fresh, error: readError } = await supabase
        .from("agent_brain_routes")
        .select("config")
        .eq("id", editing.id)
        .eq("tenant_id", tenantId)
        .single();
      if (readError) throw readError;
      const config = {
        ...((fresh?.config as object) ?? {}),
        profile: { ...draft, avatarPath },
      };
      const { error } = await supabase
        .from("agent_brain_routes")
        .update({ config })
        .eq("id", editing.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הפרופיל נשמר");
      setEditing(null);
      qc.invalidateQueries({
        queryKey: ["connected-agent-profiles", tenantId],
      });
    },
    onError: (e: any) => toast.error("שמירה נכשלה: " + (e?.message || e)),
  });

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : undefined),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const open = (r: RouteRow) => {
    setEditing(r);
    setDraft(readProfile(r.config));
    setFile(null);
  };

  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (routes.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        אין סוכנים מחוברים. חבר Cursor, Grok או Claude מחיבורי ה-MCP.
      </p>
    );

  return (
    <div className="space-y-3" dir="rtl">
      <div className="grid gap-3 md:grid-cols-2">
        {routes.map((r) => {
          const p = readProfile(r.config);
          return (
            <Card key={r.id} className="space-y-2 p-4 text-right">
              <div className="flex items-center gap-3">
                <Avatar route={r} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.displayName || r.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.persona || "אין פרופיל עדיין"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  onClick={() => open(r)}
                >
                  <Pencil className="h-3 w-3" />
                  {p.persona || p.instructions || p.avatarPath
                    ? "עריכת פרופיל"
                    : "יצירת פרופיל"}
                </Button>
              </div>
              {p.instructions && (
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {p.instructions}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-right">
              פרופיל · {editing?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-right">
            <div className="flex items-center justify-end gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                <ImagePlus className="h-3.5 w-3.5" />
                {file ? file.name : "תמונת פרופיל"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const invalid = validateAvatarFile(f);
                    if (invalid) return toast.error(invalid);
                    setFile(f);
                  }}
                />
              </label>
              {editing && (
                <Avatar
                  route={{
                    ...editing,
                    avatarUrl: preview ?? editing.avatarUrl,
                  }}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>שם תצוגה</Label>
              <Input
                value={draft.displayName ?? ""}
                placeholder={editing?.label}
                onChange={(e) =>
                  setDraft({ ...draft, displayName: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>פרסונה (מי הוא/היא)</Label>
              <Textarea
                value={draft.persona ?? ""}
                maxLength={500}
                className="min-h-[60px]"
                onChange={(e) =>
                  setDraft({ ...draft, persona: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>הוראות לסוכן</Label>
              <Textarea
                value={draft.instructions ?? ""}
                maxLength={4000}
                className="min-h-[120px]"
                onChange={(e) =>
                  setDraft({ ...draft, instructions: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              ביטול
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              )}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
