import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/** "Sign in with Microsoft" through Supabase Auth's Azure provider: work/school and personal accounts. */
export function MicrosoftSignInButton({
  redirectTo,
  label = "התחבר עם Microsoft",
  disabled = false,
}: {
  redirectTo: string;
  label?: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    // Azure sends no email claim unless the "email" scope is asked for, and Supabase needs one.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo, scopes: "email" },
    });
    if (error) {
      console.error("Microsoft sign-in failed", error);
      toast.error(error.message || "שגיאה בהתחברות עם Microsoft");
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2"
      onClick={signIn}
      disabled={disabled || pending}
    >
      <MicrosoftLogo />
      {label}
    </Button>
  );
}

/** The four-square Microsoft mark. */
function MicrosoftLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}
