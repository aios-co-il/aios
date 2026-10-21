import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** Tenants the user belongs to, plus a handler that switches the active one. */
export function useUserTenants(userId: string | null | undefined) {
  const { toast } = useToast();

  // Fetch available tenants for the user
  const { data: userTenants } = useQuery({
    queryKey: ["user-tenants", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("tenant_users")
        .select("tenant_id, tenants(id, name, slug)")
        .eq("user_id", userId);

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const handleTenantChange = async (tenantId: string) => {
    try {
      await (supabase as any).from("user_active_tenant").upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        },
      );

      const { data: tenantData } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId)
        .single();

      const newSlug = tenantData?.slug;

      if (newSlug) {
        const pathParts = window.location.pathname.split("/");
        const currentModule =
          pathParts.length > 3 ? pathParts.slice(3).join("/") : "dashboard";

        toast({
          title: "עובר לארגון...",
          description: "המערכת עוברת לארגון החדש",
        });

        window.location.replace(`/t/${newSlug}/${currentModule}`);
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error("Error switching tenant:", error);
      toast({
        title: "שגיאה",
        description: "לא הצלחנו לעבור לארגון החדש",
        variant: "destructive",
      });
    }
  };

  return { userTenants, handleTenantChange };
}
