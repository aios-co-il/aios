import type { LucideIcon } from "lucide-react";
import { Frown, Hourglass, Meh, Smile } from "lucide-react";
import type { StatusTone } from "@/components/report-ui/statusTone";

/** The lifecycle status a client row carries. */
export type ClientStatus = "active" | "onboarding" | "paused" | "ended";

/** How the client feels about the work, as the team marks it. */
export type ClientMood =
  "happy" | "wavering" | "churn_risk" | "not_progressing";

interface ClientStatusMeta {
  label: string;
  tone: StatusTone;
  /** A small dot beside the label in pickers and on the avatar. */
  dotClass: string;
}

interface ClientMoodMeta {
  label: string;
  /** The short form used in the chat view's narrow pickers. */
  shortLabel: string;
  icon: LucideIcon;
  /** Icon and text color. */
  textClass: string;
  /** Chip and picker-trigger surface. */
  surfaceClass: string;
}

export const CLIENT_STATUSES: ReadonlyArray<ClientStatus> = [
  "active",
  "onboarding",
  "paused",
  "ended",
];

export const CLIENT_MOODS: ReadonlyArray<ClientMood> = [
  "happy",
  "wavering",
  "churn_risk",
  "not_progressing",
];

export const CLIENT_STATUS_META: Record<ClientStatus, ClientStatusMeta> = {
  active: { label: "פעיל", tone: "active", dotClass: "bg-status-active" },
  onboarding: {
    label: "בקליטה",
    tone: "progress",
    dotClass: "bg-status-progress",
  },
  paused: { label: "מושהה", tone: "draft", dotClass: "bg-status-draft" },
  ended: { label: "הסתיים", tone: "danger", dotClass: "bg-destructive" },
};

export const CLIENT_MOOD_META: Record<ClientMood, ClientMoodMeta> = {
  happy: {
    label: "לקוח מבסוט",
    shortLabel: "מבסוט",
    icon: Smile,
    textClass: "text-brand-accent-700 dark:text-brand-accent-400",
    surfaceClass: "bg-surface-status-green text-status-foreground",
  },
  wavering: {
    label: "לקוח מתנדנד",
    shortLabel: "מתנדנד",
    icon: Meh,
    textClass: "text-status-progress",
    surfaceClass: "bg-surface-status-yellow text-status-foreground",
  },
  churn_risk: {
    label: "סכנת נטישה",
    shortLabel: "סכנת נטישה",
    icon: Frown,
    textClass: "text-destructive",
    surfaceClass: "bg-surface-status-red text-destructive",
  },
  not_progressing: {
    label: "לא מתקדם",
    shortLabel: "לא מתקדם",
    icon: Hourglass,
    textClass: "text-muted-foreground",
    surfaceClass: "bg-status-draft-surface text-status-foreground",
  },
};

/** The product tags a client can carry, in filter order. */
export const CLIENT_SERVICE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "seo", label: "SEO" },
  { value: "ppc_google", label: "PPC Google" },
  { value: "ppc_meta", label: "PPC Meta" },
  { value: "social", label: "Social" },
  { value: "full_social", label: "Full Social" },
  { value: "social_meta", label: "Social Meta" },
  { value: "automation", label: "Automation" },
];

/** The status of a row, falling back to active for unknown values as the list always did. */
export function clientStatusOf(
  status: string | null | undefined,
): ClientStatus {
  return isClientStatus(status) ? status : "active";
}

/** The mood of a row; an unset mood reads as happy, as everywhere in the app. */
export function clientMoodOf(mood: string | null | undefined): ClientMood {
  return isClientMood(mood) ? mood : "happy";
}

/** Whether a value is one of the four client statuses. */
export function isClientStatus(value: unknown): value is ClientStatus {
  return CLIENT_STATUSES.some((status) => status === value);
}

/** Whether a value is one of the four client moods. */
export function isClientMood(value: unknown): value is ClientMood {
  return CLIENT_MOODS.some((mood) => mood === value);
}

/** The label of a service tag, or the raw tag when it is not a known one. */
export function clientServiceLabel(service: string): string {
  return (
    CLIENT_SERVICE_OPTIONS.find((option) => option.value === service)?.label ??
    service
  );
}
