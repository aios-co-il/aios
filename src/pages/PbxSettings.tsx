import { useNavigate } from "react-router-dom";
import { ArrowLeft, PhoneCall, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantPath } from "@/hooks/useTenantPath";
import { PbxExtensionsCard } from "@/components/PbxSettingsPage/PbxExtensionsCard";
import { PbxGeneralCard } from "@/components/PbxSettingsPage/PbxGeneralCard";
import { PbxInboundCard } from "@/components/PbxSettingsPage/PbxInboundCard";
import { PbxOutboundCard } from "@/components/PbxSettingsPage/PbxOutboundCard";
import { usePbxSettings } from "@/components/PbxSettingsPage/usePbxSettings";
import { useTenantAgents } from "@/components/PbxSettingsPage/useTenantAgents";

export default function PbxSettings() {
  const { currentTenantId } = useTenant();
  const navigate = useNavigate();
  const { buildPath } = useTenantPath();
  const pbx = usePbxSettings(currentTenantId);
  const { data: agents = [] } = useTenantAgents(currentTenantId);

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(buildPath("lead-integrations"))}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PhoneCall className="h-8 w-8" />
            חיבור מרכזיה
          </h1>
          <p className="text-muted-foreground mt-1">
            חיוג מה-CRM דרך Webhook יוצא, וקליטת הקלטות שיחה ששויכות אוטומטית
            לליד לפי מספר הטלפון
          </p>
        </div>
        {pbx.integration?.is_active && (
          <Badge className="bg-primary/90">✓ מחובר</Badge>
        )}
      </div>

      <PbxGeneralCard
        form={pbx.form}
        set={pbx.set}
        isActive={pbx.isActive}
        setIsActive={pbx.setIsActive}
      />
      <PbxOutboundCard form={pbx.form} set={pbx.set} />
      <PbxExtensionsCard
        form={pbx.form}
        agents={agents}
        setExtension={pbx.setExtension}
      />
      <PbxInboundCard
        tenantId={currentTenantId}
        secret={pbx.form.inbound_secret}
        set={pbx.set}
        isSaved={!!pbx.integration}
      />

      <Button
        onClick={() => pbx.save.mutate()}
        disabled={pbx.save.isPending || pbx.isLoading}
        size="lg"
      >
        <Save className="h-4 w-4 ml-2" />
        {pbx.save.isPending ? "שומר..." : "שמור הגדרות"}
      </Button>
    </div>
  );
}
