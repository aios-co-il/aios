import { LogOut, Menu, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAccessibleMenuModules } from "@/hooks/useAccessibleMenuModules";
import { useTenantPath } from "@/hooks/useTenantPath";
import { Switch } from "@/components/ui/switch";
import { useAppColorMode } from "@/theme/appColorMode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Header menu: the system settings (the menu's admin tab), dark mode and logout. */
export function UserMenu() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { buildPath } = useTenantPath();
  const { groups } = useAccessibleMenuModules();
  const settings = groups.find((group) => group.id === "admin")?.modules ?? [];
  const colorMode = useAppColorMode();

  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
    },
    onError: async () => {
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
        // Storage may be unavailable; onSettled still completes logout.
      }
    },
    onSettled: () => {
      navigate("/auth", { replace: true });
      toast({
        title: "התנתקת בהצלחה",
        description: "להתראות!",
      });
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          aria-label="תפריט מערכת"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        dir="rtl"
        className="z-[100] max-h-[min(80vh,36rem)] w-60 overflow-y-auto bg-background"
      >
        {settings.map((module) => {
          const Icon = module.icon;
          return (
            <DropdownMenuItem
              key={module.key}
              onClick={() => navigate(buildPath(module.route))}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              {module.label}
            </DropdownMenuItem>
          );
        })}
        {settings.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={colorMode.mode === "dark"}
          // Keep the menu open so the switch is seen flipping.
          onSelect={(event) => {
            event.preventDefault();
            colorMode.toggle();
          }}
          className="gap-2"
        >
          <Moon className="h-4 w-4" />
          מצב כהה
          <Switch
            checked={colorMode.mode === "dark"}
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none ms-auto"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout.mutate()} className="gap-2">
          <LogOut className="h-4 w-4" />
          התנתק
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
