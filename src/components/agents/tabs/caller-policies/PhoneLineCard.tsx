import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUserRole } from "@/hooks/useUserRole";
import { usePhoneLineMutations, usePhoneLines } from "./usePhoneLines";

/**
 * The org's numbers that ring Carmen; calls to them follow the policies below. Owners
 * read and remove them; only a super admin adds one (AIO-511).
 */
export function PhoneLineCard({ tenantId }: { tenantId: string }) {
  const lines = usePhoneLines(tenantId);
  const { remove } = usePhoneLineMutations(tenantId);
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="text-base">המספר של כרמן</CardTitle>
        <CardDescription>
          שיחות למספר הזה מגיעות לכרמן. את המספר מחברים קודם ב-ElevenLabs (SIP
          trunk).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(lines.data ?? []).map((line) => (
          <div key={line.id} className="flex items-center justify-between">
            <span dir="ltr">{line.phone_number}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(line.id, { onError: fail })}
            >
              הסרה
            </Button>
          </div>
        ))}
        {roleLoading ? null : isSuperAdmin ? (
          <AddPhoneLine tenantId={tenantId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            רק סופר אדמין מוסיף מספרים.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Registers a number for the org; RLS lets only a super admin insert. */
function AddPhoneLine({ tenantId }: { tenantId: string }) {
  const { add } = usePhoneLineMutations(tenantId);
  const [number, setNumber] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        dir="ltr"
        placeholder="03-1234567"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        aria-label="מספר טלפון"
      />
      <Button
        disabled={!number.trim() || add.isPending}
        onClick={() =>
          add.mutate(number, {
            onSuccess: () => {
              setNumber("");
              toast.success("המספר נוסף");
            },
            onError: fail,
          })
        }
      >
        הוספה
      </Button>
    </div>
  );
}

/** Shows a refused or failed write; RLS refusals arrive here. */
function fail(e: Error) {
  toast.error(`הפעולה נכשלה: ${e.message}`);
}
