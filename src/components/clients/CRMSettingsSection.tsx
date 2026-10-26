import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Settings2,
  TrendingUp,
  Search,
  Share2,
  BarChart3,
  Check,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { SeoUpdateModal } from "@/components/clients/SeoUpdateModal";
import type { Json, Tables } from "@/integrations/supabase/types";
import { parseClientServices } from "@/lib/clientServices-b13";

// ── Constants ──────────────────────────────────────────────────────────────────
const TIER_OPTIONS = [
  {
    value: "A",
    label: "A — עדיפות גבוהה",
    color: "bg-red-100 text-red-700 border-red-300",
  },
  {
    value: "B",
    label: "B — עדיפות בינונית",
    color: "bg-yellow-100 text-yellow-700 border-yellow-300",
  },
  {
    value: "C",
    label: "C — עדיפות רגילה",
    color: "bg-green-100 text-green-700 border-green-300",
  },
];

const SERVICE_OPTIONS = [
  { value: "ppc_google", label: "PPC Google", icon: BarChart3 },
  { value: "ppc_meta", label: "PPC Meta", icon: BarChart3 },
  { value: "seo", label: "SEO", icon: Search },
  { value: "social", label: "Social", icon: Share2 },
  { value: "full_social", label: "Full Social", icon: Share2 },
  { value: "social_meta", label: "Social Meta", icon: Share2 },
  { value: "automation", label: "Automation", icon: Settings2 },
];

const SEO_STATUS_OPTIONS = [
  { value: "up", label: "עלייה", color: "text-green-700" },
  { value: "stable", label: "יציב", color: "text-blue-700" },
  { value: "down", label: "ירידה", color: "text-red-700" },
];

// ── Main component ─────────────────────────────────────────────────────────────
interface CRMSettingsSectionProps {
  client: {
    id: string;
    name: string;
    tier?: string | null;
    services?: Json;
  };
  onUpdate?: () => void;
}

type ClientCrmPatch = Partial<Pick<Tables<"clients">, "tier" | "services">>;
type SeoHistoryEntry = Pick<
  Tables<"seo_monthly_updates">,
  "month" | "status" | "notes"
>;

const hasClientId = (row: unknown, id: string): row is { id: string } =>
  typeof row === "object" && row !== null && "id" in row && row.id === id;

export function CRMSettingsSection({
  client,
  onUpdate,
}: CRMSettingsSectionProps) {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();

  const [seoOpen, setSeoOpen] = useState(false);

  // Current values (graceful fallback if columns don't exist yet)
  const currentTier: string = client.tier ?? "";
  const currentServices = parseClientServices(client.services);
  const hasSeo = currentServices.includes("seo");

  // Fetch last 3 SEO updates
  const { data: seoHistory = [] } = useQuery({
    queryKey: ["seo-history", client.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("seo_monthly_updates")
          .select("month, status, notes, updated_at")
          .eq("client_id", client.id)
          .order("month", { ascending: false })
          .limit(3)
          .overrideTypes<SeoHistoryEntry[], { merge: false }>();
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!client.id && hasSeo,
  });

  // Optimistically patch one field of this client across all cached ["clients", ...] lists,
  // so toggles feel instant and we avoid refetching the whole (heavy) clients list per click.
  const patchClientInCache = (patch: ClientCrmPatch) => {
    const snapshot = queryClient.getQueriesData({ queryKey: ["clients"] });
    queryClient.setQueriesData({ queryKey: ["clients"] }, (old: unknown) =>
      Array.isArray(old)
        ? old.map((c: unknown) =>
            hasClientId(c, client.id) ? { ...c, ...patch } : c,
          )
        : old,
    );
    return snapshot;
  };
  const restoreClientsCache = (
    snapshot: [readonly unknown[], unknown][] | undefined,
  ) => {
    snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
  };

  // ── Mutation: update tier ───────────────────────────────────────────────────
  const updateTierMutation = useMutation({
    mutationFn: async (tier: string) => {
      const { error } = await supabase
        .from("clients")
        .update({ tier })
        .eq("id", client.id);
      if (error) throw error;
    },
    onMutate: async (tier: string) => {
      await queryClient.cancelQueries({ queryKey: ["clients"] });
      return { snapshot: patchClientInCache({ tier }) };
    },
    onError: (_e, _v, ctx) => {
      restoreClientsCache(ctx?.snapshot);
      toast.error("שגיאה בעדכון Tier");
    },
  });

  // ── Mutation: toggle service ────────────────────────────────────────────────
  const updateServicesMutation = useMutation({
    mutationFn: async (services: string[]) => {
      const { error } = await supabase
        .from("clients")
        .update({ services })
        .eq("id", client.id);
      if (error) throw error;
    },
    onMutate: async (services: string[]) => {
      await queryClient.cancelQueries({ queryKey: ["clients"] });
      return { snapshot: patchClientInCache({ services }) };
    },
    onError: (_e, _v, ctx) => {
      restoreClientsCache(ctx?.snapshot);
      toast.error("שגיאה בעדכון שירותים");
    },
  });

  function toggleService(val: string) {
    const next = currentServices.includes(val)
      ? currentServices.filter((s) => s !== val)
      : [...currentServices, val];
    updateServicesMutation.mutate(next);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="bg-card border border-border/60 rounded-xl p-4 space-y-4 text-right shadow-sm"
        dir="rtl"
      >
        <h3 className="font-semibold text-sm flex items-center gap-2 justify-end">
          הגדרות CRM
          <Settings2 className="h-4 w-4 text-primary" />
        </h3>

        {/* Tier */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            דרגת חשיבות (Tier)
          </Label>
          <div className="flex gap-2 flex-wrap justify-end">
            {TIER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateTierMutation.mutate(opt.value)}
                className={`px-3 py-1 rounded-full border text-xs font-semibold transition-all ${
                  currentTier === opt.value
                    ? opt.color + " ring-2 ring-offset-1 ring-current"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {opt.value}
              </button>
            ))}
            {currentTier && (
              <span className="text-xs text-muted-foreground self-center">
                {TIER_OPTIONS.find((o) => o.value === currentTier)?.label}
              </span>
            )}
          </div>
        </div>

        <Separator />

        {/* Services */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            שירותים פעילים
          </Label>
          <div className="flex gap-2 flex-wrap justify-end">
            {SERVICE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = currentServices.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleService(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* SEO update button — only if SEO service is active */}
        {hasSeo && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setSeoOpen(true)}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  עדכון SEO חודשי
                </Button>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Search className="h-3.5 w-3.5" />
                  היסטוריית SEO
                </Label>
              </div>

              {seoHistory.length > 0 ? (
                <div className="flex gap-2 flex-wrap justify-end">
                  {seoHistory.map((entry) => {
                    const opt = SEO_STATUS_OPTIONS.find(
                      (o) => o.value === entry.status,
                    );
                    return (
                      <div
                        key={entry.month}
                        className="flex items-center gap-1 text-xs border rounded-md px-2 py-1 bg-muted/30"
                      >
                        <CalendarDays className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {entry.month}
                        </span>
                        <span className={opt?.color ?? ""}>
                          {opt?.label ?? entry.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  אין עדכוני SEO עדיין
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <SeoUpdateModal
        clientId={client.id}
        clientName={client.name}
        open={seoOpen}
        onOpenChange={setSeoOpen}
      />
    </>
  );
}
