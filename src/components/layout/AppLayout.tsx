import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { GlobalApprovalsBell } from "@/components/agents/GlobalApprovalsBell";
import { HeaderModuleShortcuts } from "./HeaderModuleShortcuts";
import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import { RoutedModulePermissionGate } from "@/components/ModulePermissionGate";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTenant } from "@/contexts/TenantContext";
import { ViewAsProvider } from "@/contexts/ViewAsContext";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { CommandCenterSidecarShell } from "@/components/carmen-command/CommandCenterSidecarShell";
import { CarmenLoadingScreen } from "@/components/shared/CarmenLoadingScreen";
import { CarmenRouteProgress } from "@/components/shared/CarmenRouteProgress";
import { useCarmenContentFade } from "@/hooks/useCarmenContentFade";
import { AgencySelector } from "./AgencySelector";
import { CarmenSessionButton } from "./CarmenSessionButton";
import { UserMenu } from "./UserMenu";
import { useUserTenants } from "./useUserTenants";
import { useProcessPendingInvitation } from "./useProcessPendingInvitation";

function RouteContentLoader() {
  return <CarmenLoadingScreen />;
}

export function AppLayout() {
  const { userId } = useCurrentUser();
  const { currentTenantId, setCurrentTenantId, currentTenant } = useTenant();
  const contentFadeRef = useCarmenContentFade<HTMLDivElement>();
  const { userTenants, handleTenantChange } = useUserTenants(userId);
  useProcessPendingInvitation(userId);

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
                <AgencySelector />
                <GlobalApprovalsBell />
                {/* Carmen work session entry point (allowlisted users only). */}
                <CarmenSessionButton />
                <UserMenu />
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
