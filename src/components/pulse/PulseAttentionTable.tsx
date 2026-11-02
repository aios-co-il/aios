import { Facebook, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PulseAttentionIssue,
  PulseAttentionRow,
} from "@/lib/pulseAttentionMatrix";
import type { PulseCampaignGoal } from "@/lib/pulseCampaignGoals";
import { formatPulseTargetValue } from "@/components/pulse/formatPulseTargetValue";
import { pulsePlatformName } from "../../../supabase/functions/_shared/pulse/platforms.ts";
import {
  pulseTargetKindLabel,
  pulseTargetKindsForGoal,
  pulseTargetSourceLabel,
  type PulseTargetKind,
} from "../../../supabase/functions/_shared/pulse/targets/kinds.ts";

type PulseAttentionTableProps = {
  rows: PulseAttentionRow[];
  onOpenClient: (clientId: string) => void;
  /** Opens the target editor (platform + per-campaign) for this row. */
  onEditTargets: (row: PulseAttentionRow) => void;
};

/** The kind a platform is measured on without a target: its goal's default, CPL for an unknown goal. */
function goalKind(goal: PulseCampaignGoal): PulseTargetKind {
  return pulseTargetKindsForGoal(goal)[0] ?? "cpl";
}

function IssueCell({ issue }: { issue: PulseAttentionIssue | null }) {
  if (!issue) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const variant =
    issue.level === "alert"
      ? "destructive"
      : issue.level === "watch"
        ? "secondary"
        : "outline";
  return (
    <Badge
      variant={variant}
      className="whitespace-normal text-right leading-snug max-w-[220px]"
    >
      {issue.label}
    </Badge>
  );
}

export function PulseAttentionTable({
  rows,
  onOpenClient,
  onEditTargets,
}: PulseAttentionTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        אין כרגע לקוחות/פלטפורמות שדורשים תשומת לב בטווח ובסינון שנבחרו
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table dir="rtl">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right min-w-[140px]">לקוח</TableHead>
              <TableHead className="text-right min-w-[100px]">
                פלטפורמה
              </TableHead>
              <TableHead className="text-right min-w-[120px]">יעד</TableHead>
              <TableHead className="text-right min-w-[140px]">
                מגע בקמפיין
              </TableHead>
              <TableHead className="text-right min-w-[160px]">
                יעילות / CPL
              </TableHead>
              <TableHead className="text-right min-w-[140px]">
                תקשורת אחרונה
              </TableHead>
              <TableHead className="text-right min-w-[140px]">
                תלונה / עדכון
              </TableHead>
              <TableHead className="text-right min-w-[140px]">
                שביעות רצון
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              // A CPA target on an ecommerce platform is money, not a ROAS ratio.
              const targetLabel = row.target
                ? formatPulseTargetValue(row.target.kind, row.target.value)
                : "אין יעד";
              return (
                <TableRow key={`${row.clientId}:${row.platform}`}>
                  <TableCell className="align-top">
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline text-right"
                      onClick={() => onOpenClient(row.clientId)}
                    >
                      {row.clientName}
                    </button>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {row.campaignerName}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1.5">
                      {row.platform === "meta" ? (
                        <Facebook className="h-4 w-4 text-blue-600 shrink-0" />
                      ) : (
                        <svg
                          className="h-4 w-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                        >
                          <circle cx="6" cy="18" r="3.5" fill="#34A853" />
                        </svg>
                      )}
                      <span>{pulsePlatformName(row.platform)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-start gap-1">
                      <div className="min-w-0">
                        <div className="text-sm">{targetLabel}</div>
                        {row.target ? (
                          <Badge
                            variant={
                              row.target.source === "carmen_market"
                                ? "secondary"
                                : "outline"
                            }
                            className="mt-0.5 text-[10px] whitespace-nowrap"
                            title={row.target.rationale ?? undefined}
                          >
                            {pulseTargetSourceLabel(row.target.source)}
                          </Badge>
                        ) : null}
                        <div className="text-[11px] text-muted-foreground">
                          {pulseTargetKindLabel(
                            row.target?.kind ?? goalKind(row.primaryGoal),
                          )}
                          {row.currentEfficiency !== null &&
                          row.target?.kind !== "cpa"
                            ? ` · נוכחי ${formatPulseTargetValue(goalKind(row.primaryGoal), row.currentEfficiency)}`
                            : ""}
                        </div>
                      </div>
                      {row.tableId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label="עריכת יעדים"
                          onClick={() => onEditTargets(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <IssueCell issue={row.issues.campaignTouch} />
                  </TableCell>
                  <TableCell className="align-top">
                    <IssueCell issue={row.issues.efficiency} />
                  </TableCell>
                  <TableCell className="align-top">
                    <IssueCell issue={row.issues.lastCommunication} />
                  </TableCell>
                  <TableCell className="align-top">
                    <IssueCell issue={row.issues.complaintUpdate} />
                  </TableCell>
                  <TableCell className="align-top">
                    <IssueCell issue={row.issues.satisfaction} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
