import type { Dispatch, SetStateAction } from "react";
import type { PulseAlertRules } from "@/lib/pulseAlertRules";
import { resolveUnansweredReplyHours } from "../../../supabase/functions/_shared/pulse/unanswered-reply.ts";
import { ThresholdInput } from "./PulseCostRulesSection";

type UnansweredReplyHoursFieldProps = {
  rules: PulseAlertRules;
  onChange: Dispatch<SetStateAction<PulseAlertRules>>;
};

/**
 * pulse_alert_rules.unanswered_reply_hours: after this many business hours
 * without a staff reply to a client's message in a linked group, Carmen
 * alerts the campaigner. Stored next to the pulse checks, so whoever edits
 * those edits it.
 */
export function UnansweredReplyHoursField({
  rules,
  onChange,
}: UnansweredReplyHoursFieldProps) {
  return (
    <div className="rounded-lg border p-3">
      <ThresholdInput
        label="התראה כשלקוח לא קיבל מענה בקבוצה אחרי (שעות עבודה)"
        value={resolveUnansweredReplyHours(rules.unanswered_reply_hours)}
        min={1}
        onCommit={(unanswered_reply_hours) =>
          onChange((prev) => ({ ...prev, unanswered_reply_hours }))
        }
      />
    </div>
  );
}
