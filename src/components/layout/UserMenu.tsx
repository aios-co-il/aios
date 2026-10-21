import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Header logo menu with the logout action. */
export function UserMenu() {
  const navigate = useNavigate();
  const { toast } = useToast();

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
        <Button variant="ghost" size="icon" className="rounded-full">
          <img
            src="/brand/carmen/symbol-soft.webp"
            alt="Logo"
            className="h-8 w-8 object-contain"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-background z-[100]">
        <DropdownMenuItem onClick={() => logout.mutate()}>
          <LogOut className="mr-2 h-4 w-4" />
          התנתק
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
