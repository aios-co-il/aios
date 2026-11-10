import type { ReactNode } from "react";
import { AiosLogo } from "@/components/brand/AiosLogo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Provide the common auth layout and optional invitation context. */
export function AuthShell({
  children,
  inviteBanner,
  hideInvitation,
}: {
  children: ReactNode;
  inviteBanner: string | null;
  hideInvitation: boolean;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A1526] p-4">
      <Card className="w-full max-w-md border-white/10 bg-card/95 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex flex-col items-center gap-3">
            <AiosLogo orb tagline className="text-5xl" />
          </div>
        </CardHeader>

        <CardContent>
          {inviteBanner && !hideInvitation && (
            <p className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">
              {inviteBanner}
            </p>
          )}

          {children}
        </CardContent>
      </Card>
    </div>
  );
}
