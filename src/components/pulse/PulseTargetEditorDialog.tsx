import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPulseMoney, goalLabel } from "@/lib/pulseDashboard";
import type {
  PulseCampaignGoal,
  PulseCampaignGoalRow,
} from "@/lib/pulseCampaignGoals";
import {
  campaignRowTarget,
  pulseTargetKindLabel,
  pulseTargetKindsForGoal,
  pulseTargetSourceLabel,
  resolvePulseTargetAcross,
  type PulseTarget,
  type PulseTargetKind,
} from "@/lib/pulseTargets";
import {
  pulseTargetSaveKey,
  type PulseTargetSaveInput,
} from "@/lib/pulseTargetSave";

export type { PulseTargetSaveInput };

export type PulseTargetEditorContext = {
  clientId: string;
  clientName: string;
  platform: "meta" | "google";
  primaryGoal: PulseCampaignGoal;
  /** Every report table of this client × platform; a platform target goes to all. */
  platformTableIds: string[];
  baselineEfficiency7d?: number | null;
};

type PulseTargetEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: PulseTargetEditorContext | null;
  /** Campaigns of this client × platform with spend in the last 7 days. */
  campaigns: PulseCampaignGoalRow[];
  tableSettingsById: Map<string, Record<string, unknown>>;
  /** pulseTargetSaveKey of the row being saved, while a save runs. */
  savingKey: string | null;
  onSave: (input: PulseTargetSaveInput) => Promise<void>;
};

const EDITABLE_GOALS = new Set<PulseCampaignGoal>(["leads", "ecommerce"]);

const platformLabel = (platform: "meta" | "google") =>
  platform === "meta" ? "Meta" : "Google Ads";

function formatTarget(kind: PulseTargetKind, value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return kind === "roas" ? value.toFixed(2) : formatPulseMoney(value);
}

function parseDraft(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "invalid";
}

function SourceBadge({ target }: { target: PulseTarget | null }) {
  if (!target) {
    return (
      <Badge variant="outline" className="text-[10px]">
        אין יעד
      </Badge>
    );
  }
  const market = target.source === "carmen_market";
  return (
    <Badge
      variant={market ? "secondary" : "default"}
      className="text-[10px] whitespace-nowrap"
      title={market && target.rationale ? target.rationale : undefined}
    >
      {pulseTargetSourceLabel(target.source)}
    </Badge>
  );
}

/** Where an inherited target comes from; it cannot be edited or removed here. */
function inheritedFrom(
  target: PulseTarget | null,
  ownScope: PulseTarget["scope"],
): string | null {
  if (!target || target.scope === ownScope) return null;
  if (target.scope === "platform") return "מהפלטפורמה";
  return "מהגדרות הדוח";
}

function TargetRow({
  title,
  subtitle,
  goal,
  target,
  inherited,
  saving,
  onSave,
}: {
  title: string;
  subtitle?: string;
  goal: PulseCampaignGoal;
  target: PulseTarget | null;
  /** Where the shown target comes from when it is not this row's own (else null). */
  inherited: string | null;
  saving: boolean;
  onSave: (kind: PulseTargetKind, value: number | null) => Promise<void>;
}) {
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
              {formatTarget(target.kind, target.value)}
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
              onValueChange={(value) => setKind(value as PulseTargetKind)}
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

/**
 * Targets for one client × platform: the platform target and one row per campaign
 * (CPL for lead campaigns, ROAS or CPA for ecommerce). Anything saved here is an
 * approved target, so it also replaces a market target Carmen set.
 */
export function PulseTargetEditorDialog({
  open,
  onOpenChange,
  context,
  campaigns,
  tableSettingsById,
  savingKey,
  onSave,
}: PulseTargetEditorDialogProps) {
  // Remount the rows when the dialog opens for another client so drafts reset.
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => {
    if (open) setOpenedAt(Date.now());
  }, [open, context?.clientId, context?.platform]);

  const platformGoal = context?.primaryGoal ?? "leads";
  const platformTableIds = useMemo(
    () => context?.platformTableIds ?? [],
    [context?.platformTableIds],
  );
  // The pulse reads a platform target from any of the platform's tables.
  const platformTarget = useMemo(
    () =>
      resolvePulseTargetAcross(
        platformTableIds.map((tableId) => ({
          tableId,
          settings: tableSettingsById.get(tableId) ?? {},
        })),
        platformGoal,
      ),
    [platformTableIds, platformGoal, tableSettingsById],
  );

  const campaignRows = useMemo(
    () =>
      campaigns
        .filter((row) => EDITABLE_GOALS.has(row.goal))
        .sort((a, b) => (b.spend_7d || 0) - (a.spend_7d || 0))
        .map((row) => {
          const { target, tableId, campaignId } = campaignRowTarget(
            row,
            tableSettingsById,
          );
          return {
            row,
            target,
            inherited: inheritedFrom(target, "campaign"),
            // Save over the entry the shown target came from.
            saveTo: { tableIds: [tableId], campaignId },
          };
        }),
    [campaigns, tableSettingsById],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-xl max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            יעדים — {context?.clientName}{" "}
            {context ? `· ${platformLabel(context.platform)}` : ""}
          </DialogTitle>
          <DialogDescription>
            יעד שנשמר כאן הוא יעד מאושר: הוא מחליף יעד שוק שכרמן קבעה וגובר עליו
            בכל רמה. יעד מאושר של קמפיין גובר על יעד הפלטפורמה.
          </DialogDescription>
        </DialogHeader>

        {context ? (
          <div className="space-y-4 py-1" key={openedAt}>
            {platformTableIds.length > 0 &&
            EDITABLE_GOALS.has(context.primaryGoal) ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">יעד לפלטפורמה</div>
                <TargetRow
                  title={`כל קמפייני ה${goalLabel(platformGoal as "leads" | "ecommerce")} ב־${platformLabel(context.platform)}`}
                  subtitle={
                    context.baselineEfficiency7d
                      ? `בסיס 4 שבועות: ${formatTarget(
                          pulseTargetKindsForGoal(platformGoal)[0] ?? "cpl",
                          context.baselineEfficiency7d,
                        )}`
                      : undefined
                  }
                  goal={platformGoal}
                  target={platformTarget}
                  // Legacy report-settings targets are shown, not removed here.
                  inherited={inheritedFrom(platformTarget, "platform")}
                  saving={
                    savingKey ===
                    pulseTargetSaveKey({ tableIds: platformTableIds })
                  }
                  onSave={(kind, value) =>
                    onSave({
                      tableIds: platformTableIds,
                      goal: platformGoal,
                      kind,
                      value,
                    })
                  }
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-semibold">יעדים לקמפיינים</div>
              {campaignRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  אין קמפייני לידים או איקומרס עם הוצאה ב־7 הימים האחרונים
                </p>
              ) : (
                campaignRows.map(({ row, target, inherited, saveTo }) => {
                  const save = {
                    ...saveTo,
                    campaignName: row.campaign_name,
                  };
                  return (
                    <TargetRow
                      key={row.campaign_key}
                      title={row.campaign_name}
                      subtitle={`${goalLabel(row.goal as "leads" | "ecommerce")} · הוצאה 7 ימים ${formatPulseMoney(row.spend_7d)}${
                        row.efficiency_7d !== null
                          ? ` · נוכחי ${formatTarget(
                              row.goal === "ecommerce" &&
                                row.target_kind !== "cpa"
                                ? "roas"
                                : "cpl",
                              row.efficiency_7d,
                            )}`
                          : ""
                      }`}
                      goal={row.goal}
                      target={target}
                      inherited={inherited}
                      saving={savingKey === pulseTargetSaveKey(save)}
                      onSave={(kind, value) =>
                        onSave({
                          ...save,
                          goal: row.goal,
                          kind,
                          value,
                        })
                      }
                    />
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
