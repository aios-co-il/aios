import { useState } from "react";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Skin, SkinDraft } from "@/components/skins-manager/types";
import { useSkins } from "@/components/skins-manager/useSkins";
import { useSkinAvatars } from "@/components/skins-manager/useSkinAvatars";
import { SkinsHeader } from "@/components/skins-manager/SkinsHeader";
import { SkinsCatalog } from "@/components/skins-manager/SkinsCatalog";
import { SkinEditDialog } from "@/components/skins-manager/SkinEditDialog";

export interface SkinsManagerProps {
  /**
   * Render inside a host panel/tab (e.g. Carmen's screen): no page container,
   * no h1 page header, and no viewport-height scroll area — the host scrolls.
   */
  embedded?: boolean;
}

export default function SkinsManager({ embedded = false }: SkinsManagerProps) {
  const { tenantId } = useCurrentTenant();
  const [editing, setEditing] = useState<SkinDraft | null>(null);
  const avatars = useSkinAvatars();
  const { skins, isLoading, saveMutation } = useSkins(tenantId, () =>
    setEditing(null),
  );

  const globals = (skins || []).filter((s) => s.scope === "global");
  const tenantSkins = (skins || []).filter((s) => s.scope === "tenant");

  // Clone a global skin into an editable tenant override (same slug).
  const cloneToTenant = (s: Skin) => {
    const exists = tenantSkins.some((t) => t.slug === s.slug);
    if (exists) {
      toast.info("כבר קיימת גרסת ארגון לסקין הזה — ערוך אותה למטה.");
      return;
    }
    setEditing({ ...s, id: undefined, scope: "tenant", tenant_id: tenantId });
  };

  const newSkin = () =>
    setEditing({
      scope: "tenant",
      is_active: true,
      allowed_tools: [],
      triggers: [],
      handoff_slugs: [],
    });

  const catalog = (
    <SkinsCatalog
      embedded={embedded}
      globals={globals}
      tenantSkins={tenantSkins}
      avatarFor={avatars.avatarFor}
      onEdit={setEditing}
      onClone={cloneToTenant}
    />
  );

  return (
    <div
      className={
        embedded ? "space-y-4" : "p-4 md:p-6 space-y-6 max-w-6xl mx-auto"
      }
      dir="rtl"
    >
      <SkinsHeader embedded={embedded} onNew={newSkin} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : embedded ? (
        catalog
      ) : (
        <ScrollArea className="h-[calc(100vh-180px)]">{catalog}</ScrollArea>
      )}

      <SkinEditDialog
        editing={editing}
        setEditing={setEditing}
        avatars={avatars}
        isSaving={saveMutation.isPending}
        onSave={(s) => saveMutation.mutate(s)}
      />
    </div>
  );
}
