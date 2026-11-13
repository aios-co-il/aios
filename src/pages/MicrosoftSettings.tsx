import { Mail } from "lucide-react";
import { MicrosoftConnectionCard } from "@/components/MicrosoftSettings/MicrosoftConnectionCard";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

/** Microsoft 365 / Outlook settings: the account connection (AIO-322). */
export default function MicrosoftSettings() {
  const { tenantId } = useCurrentTenant();

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="h-8 w-8" />
          הגדרות Microsoft 365
        </h1>
        <p className="text-muted-foreground mt-1">
          חיבור Outlook, יומן, Teams, OneDrive ואנשי קשר
        </p>
      </div>
      <MicrosoftConnectionCard tenantId={tenantId} />
    </div>
  );
}
