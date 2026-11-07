import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";

type OrgType = "organization" | "sub_organization";

type ConvertTenantPayload = {
  tenant_id: string;
  new_org_type: OrgType;
  new_parent_id?: string;
};

interface ConvertTenantTypeDialogProps {
  tenant: { id: string; name: string; org_type: string } | null;
  availableParents: Array<{ id: string; name: string; org_type: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConvertTenantTypeDialog({
  tenant,
  availableParents,
  open,
  onOpenChange,
}: ConvertTenantTypeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newOrgType, setNewOrgType] = useState<OrgType>("organization");
  const [newParentId, setNewParentId] = useState<string>("");

  const convertMutation = useMutation({
    mutationFn: async (data: ConvertTenantPayload) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("לא מחובר למערכת");

      const response = await supabase.functions.invoke("convert-tenant-type", {
        body: data,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-tenants"] });
      toast({
        title: "סוג הארגון שונה בהצלחה",
        description: "השינוי בוצע והמערכת עודכנה",
      });
      onOpenChange(false);
      setNewParentId("");
    },
    onError: (error: Error) => {
      toast({
        title: "שגיאה בשינוי סוג הארגון",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleConvert = () => {
    if (!tenant) return;

    const data: ConvertTenantPayload = {
      tenant_id: tenant.id,
      new_org_type: newOrgType,
      ...(newOrgType === "sub_organization" && newParentId
        ? { new_parent_id: newParentId }
        : {}),
    };

    convertMutation.mutate(data);
  };

  const getOrgTypeLabel = (type: string) => {
    switch (type) {
      case "root":
        return "ארגון שורש";
      case "organization":
        return "ארגון";
      case "sub_organization":
        return "תת-ארגון";
      default:
        return type;
    }
  };

  const filteredParents = availableParents.filter(
    (p) => p.id !== tenant?.id && p.org_type !== "sub_organization",
  );

  const canConvert =
    newOrgType === "organization" ||
    (newOrgType === "sub_organization" && newParentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            שינוי סוג ארגון
          </DialogTitle>
          <DialogDescription>
            שנה את סוג הארגון "{tenant?.name}" מ-
            {getOrgTypeLabel(tenant?.org_type || "")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-3">
            <Label>סוג ארגון חדש:</Label>
            <RadioGroup
              value={newOrgType}
              onValueChange={(v) => {
                if (v === "organization" || v === "sub_organization")
                  setNewOrgType(v);
              }}
            >
              <div className="flex items-center space-x-2 space-x-reverse">
                <RadioGroupItem value="organization" id="org" />
                <Label htmlFor="org" className="cursor-pointer">
                  ארגון - יכול ליצור תת-ארגונים
                </Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <RadioGroupItem value="sub_organization" id="sub" />
                <Label htmlFor="sub" className="cursor-pointer">
                  תת-ארגון - לא יכול ליצור ארגונים נוספים
                </Label>
              </div>
            </RadioGroup>
          </div>

          {newOrgType === "sub_organization" && (
            <div className="space-y-2">
              <Label>ארגון האב:</Label>
              <Select value={newParentId} onValueChange={setNewParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר ארגון אב" />
                </SelectTrigger>
                <SelectContent>
                  {filteredParents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.name} ({getOrgTypeLabel(parent.org_type)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredParents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  אין ארגונים זמינים כארגון אב
                </p>
              )}
            </div>
          )}

          {newOrgType === "organization" && (
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
              המרה לארגון תנתק את הקשר לארגון האב (אם קיים) ותאפשר לארגון זה
              ליצור תת-ארגונים.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setNewParentId("");
            }}
          >
            ביטול
          </Button>
          <Button
            onClick={handleConvert}
            disabled={!canConvert || convertMutation.isPending}
          >
            {convertMutation.isPending ? "משנה..." : "שנה סוג"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
