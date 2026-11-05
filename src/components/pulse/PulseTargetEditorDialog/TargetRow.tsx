import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPulseTargetValue } from "@/components/pulse/formatPulseTargetValue";
import {
  isTargetKind,
  pulseTargetKindLabel,
  pulseTargetKindsForGoal,
  type PulseTarget,
  type PulseTargetKind,
} from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import { SourceBadge } from "./SourceBadge";
import { parseDraft } from "./targetFormat";

type TargetRowProps = {
  title: string;
  subtitle?: string;
  goal: string;
  target: PulseTarget | null;
  /** Where the shown target comes from when it is not this row's own (else null). */
  inherited: string | null;
  saving: boolean;
  onSave: (kind: PulseTargetKind, value: number | null) => void;
};

/**
 * One editable target: the target in force with its source, a kind picker when
 * the goal has several, and a value to save, approve (Carmen's estimate) or
 * clear. An inherited target is shown but not edited here.
 */
export function TargetRow({
  title,
  subtitle,
  goal,
  target,
  inherited,
  saving,
  onSave,
}: TargetRowProps) {
  const kinds = pulseTargetKindsForGoal(goal);
  const ownTarget = inherited ? null : target;
  const [kind, setKind] = useState<PulseTargetKind>(
    ownTarget?.kind ?? kinds[0] ?? "cpl",
  );
  const [draft, setDraft] = useState(ownTarget ? String(ownTarget.value) : "");
  const parsed = parseDraft(draft);
  const market = ownTarget?.source === "carmen_market";

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium break-words">{title}</div>
          {subtitle ? (
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {target ? (
            <span>
              {pulseTargetKindLabel(target.kind)}{" "}
              {formatPulseTargetValue(target.kind, target.value)}
              {inherited ? ` (${inherited})` : ""}
            </span>
          ) : null}
          <SourceBadge target={target} />
        </div>
      </div>
      {market && ownTarget?.rationale ? (
        <p className="text-[11px] text-muted-foreground leading-snug">
          נימוק כרמן: {ownTarget.rationale}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        {kinds.length > 1 ? (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">מדד</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                if (isTargetKind(value)) {
                  setKind(value);
                }
              }}
            >
              <SelectTrigger className="h-8 w-[92px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-[200]">
                {kinds.map((option) => (
                  <SelectItem key={option} value={option}>
                    {pulseTargetKindLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1 flex-1 min-w-[120px]">
          <Label className="text-[11px] text-muted-foreground">
            {kinds.length > 1 ? "ערך" : pulseTargetKindLabel(kind)}
          </Label>
          <Input
            inputMode="decimal"
            className="h-8"
            value={draft}
            placeholder={kind === "roas" ? "לדוגמה: 3" : "לדוגמה: 90"}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="h-8"
          disabled={saving || parsed === "invalid" || (!draft && !ownTarget)}
          onClick={() => onSave(kind, parsed === "invalid" ? null : parsed)}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {!draft && ownTarget
            ? "הסר יעד"
            : market
              ? "אשר כיעד מאושר"
              : "שמור יעד"}
        </Button>
      </div>
    </div>
  );
}
