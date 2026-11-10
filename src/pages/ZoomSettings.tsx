import { ArrowLeft, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantPath } from "@/hooks/useTenantPath";
import { ZoomCredentialsCard } from "@/components/ZoomSettings/ZoomCredentialsCard";
import { useZoomSettings } from "@/components/ZoomSettings/useZoomSettings";

/** Zoom connection settings, used for Zoom meeting links. */
export default function ZoomSettings() {
  const { currentTenantId } = useTenant();
  const navigate = useNavigate();
  const { buildPath } = useTenantPath();
  const { form, setForm, isConnected, save } = useZoomSettings(
    currentTenantId ?? null,
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(buildPath("integrations"))}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Video className="h-8 w-8" />
            הגדרות Zoom
          </h1>
          <p className="text-muted-foreground mt-1">
            חיבור חשבון Zoom ליצירת קישורי פגישה
          </p>
        </div>
      </div>

      <ZoomCredentialsCard
        form={form}
        onChange={setForm}
        onSave={() => save.mutate()}
        saving={save.isPending}
        isConnected={isConnected}
      />
    </div>
  );
}
