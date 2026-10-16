import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { LogOut, Building2, PanelRightOpen } from "lucide-react";
import { GlobalApprovalsBell } from "@/components/agents/GlobalApprovalsBell";
import { HeaderModuleShortcuts } from "./HeaderModuleShortcuts";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Outlet, useNavigate } from "react-router-dom";
import { Suspense } from "react";
import { RoutedModulePermissionGate } from "@/components/ModulePermissionGate";
import { useToast } from "@/hooks/use-toast";
import { useAgency } from "@/contexts/AgencyContext";
import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { ViewAsProvider } from "@/contexts/ViewAsContext";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { useCommandCenterAccess } from "@/components/carmen-command/access";
import { CommandCenterSidecarShell } from "@/components/carmen-command/CommandCenterSidecarShell";
import { useCommandCenterSidecar } from "@/contexts/CommandCenterSidecarContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CarmenLoadingScreen } from "@/components/shared/CarmenLoadingScreen";
import { CarmenRouteProgress } from "@/components/shared/CarmenRouteProgress";
import { useCarmenContentFade } from "@/hooks/useCarmenContentFade";

function RouteContentLoader() {
  return <CarmenLoadingScreen />;
}

const CARMEN_CHAT_AVATAR =
  "data:image/webp;base64,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";

export function AppLayout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedAgency, setSelectedAgency, agencies } = useAgency();
  const { userId } = useCurrentUser();
  const { currentTenantId, setCurrentTenantId, currentTenant } = useTenant();
  const commandCenterAccess = useCommandCenterAccess();
  const contentFadeRef = useCarmenContentFade<HTMLDivElement>();
  const sidecar = useCommandCenterSidecar();

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

  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  useEffect(() => {
    const processInvitation = async () => {
      if (!userId || !userProfile || userProfile.status !== "pending") {
        return;
      }

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) return;

        const { data, error } = await supabase.functions.invoke(
          "process-user-invitation",
          {
            headers: {
              Authorization: `Bearer ${session.session.access_token}`,
            },
          },
        );

        if (error) {
          console.error("Error processing invitation:", error);
        } else if (data?.success) {
          window.location.reload();
        }
      } catch (error) {
        console.error("Error calling process-user-invitation:", error);
      }
    };

    processInvitation();
  }, [userId, userProfile]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
    } catch (err) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (_) {
        // Continue to token cleanup and navigation even if local sign-out fails.
      }
      try {
        Object.keys(localStorage).forEach((k) => {
          if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
        });
      } catch (_) {
        // Storage may be unavailable; the finally block still completes logout.
      }
    } finally {
      navigate("/auth", { replace: true });
      toast({
        title: "התנתקת בהצלחה",
        description: "להתראות!",
      });
    }
  };

  return (
    <ViewAsProvider>
      <SidebarProvider defaultOpen={false}>
        <div
          className="flex h-screen max-h-screen w-full overflow-hidden"
          dir="rtl"
        >
          <AppSidebar />
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <ViewAsBanner />
            <header className="sticky top-0 z-50 h-14 md:h-16 border-b bg-card flex items-center justify-between px-2 sm:px-4 md:px-6 gap-1.5 sm:gap-2 md:gap-4 flex-shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 min-w-0">
                <SidebarTrigger className="shrink-0" />
                <h1 className="text-sm md:text-xl font-bold bg-gradient-primary bg-clip-text text-transparent truncate hidden sm:inline">
                  מערכת ניהול סוכנויות
                </h1>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 flex-shrink-0">
                <HeaderModuleShortcuts />
                {agencies && agencies.length > 0 && (
                  <div className="hidden md:flex items-center gap-1 sm:gap-2 min-w-0 max-w-[42vw] sm:max-w-none">
                    <span className="text-sm text-muted-foreground hidden lg:inline shrink-0">
                      סוכנות:
                    </span>
                    <Select
                      value={selectedAgency}
                      onValueChange={setSelectedAgency}
                    >
                      <SelectTrigger className="h-9 w-[min(42vw,10rem)] sm:w-[160px] md:w-[220px] bg-background border-2 px-2">
                        <Building2 className="h-4 w-4 shrink-0" />
                        <SelectValue placeholder="סוכנות" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-[100]">
                        {agencies.length > 1 && (
                          <SelectItem value="all">כל הסוכנויות</SelectItem>
                        )}
                        {agencies.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id}>
                            {agency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <GlobalApprovalsBell />
                {/* Carmen button in header — opens the full-screen Command Center (allowlisted users only) */}
                {commandCenterAccess.allowed && (
                  <>
                    <button
                      type="button"
                      onClick={sidecar.toggle}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                        sidecar.open
                          ? "border-sky-400 bg-sky-400/15 text-sky-300"
                          : "border-border text-muted-foreground hover:border-sky-400/70 hover:text-sky-400"
                      }`}
                      title="כרמן — סיידבר תיקון מערכת (המסך נשאר גלוי)"
                      aria-label="פתח/סגור סיידבר תיקון מערכת של כרמן"
                      aria-pressed={sidecar.open}
                    >
                      <PanelRightOpen className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        const slug = currentTenant?.slug;
                        if (slug) navigate(`/t/${slug}/command-center`);
                      }}
                      className="relative group"
                      title="כרמן — מרכז פיקוד ובקרה"
                      aria-label="פתח את מרכז הפיקוד של כרמן"
                    >
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background animate-pulse z-10" />
                      <img
                        src={CARMEN_CHAT_AVATAR}
                        alt="כרמן"
                        className="h-9 w-9 rounded-full object-cover border-2 border-sky-400/70 group-hover:scale-110 group-hover:border-sky-300 transition-all duration-200"
                      />
                    </button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                    >
                      <img
                        src={logo}
                        alt="Logo"
                        className="h-8 w-8 object-contain"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-background z-[100]"
                  >
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      התנתק
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CommandCenterSidecarShell>
                <div
                  ref={contentFadeRef}
                  className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto"
                >
                  <CarmenRouteProgress />
                  <RoutedModulePermissionGate>
                    <Suspense fallback={<RouteContentLoader />}>
                      <Outlet />
                    </Suspense>
                  </RoutedModulePermissionGate>
                </div>
              </CommandCenterSidecarShell>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ViewAsProvider>
  );
}
