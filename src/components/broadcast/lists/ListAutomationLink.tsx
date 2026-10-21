import { useNavigate } from "react-router-dom";
import { useTenantPath } from "@/hooks/useTenantPath";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

/** Banner for a list kept in sync by an automation, with a link to open it. */
export function ListAutomationLink({ automationId }: { automationId: string }) {
  const navigate = useNavigate();
  const { buildPath } = useTenantPath();
  return (
    <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
      <span>
        הרשימה מסונכרנת: מי שמתחיל לעמוד בסינון נכנס, מי שמפסיק יוצא. כיבוי
        האוטומציה עוצר את הסנכרון; אפשר גם להוסיף לה צעדים (למשל שליחת טמפלייט).
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => navigate(buildPath(`automations/flow/${automationId}`))}
      >
        <Zap className="ml-1 h-4 w-4" />
        פתח אוטומציה
      </Button>
    </div>
  );
}
