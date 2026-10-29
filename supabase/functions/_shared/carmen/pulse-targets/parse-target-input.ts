import { isPulsePlatform, type PulsePlatform } from "../../pulse/platforms.ts";
import {
  isPulseTargetGoal,
  isTargetKind,
  pulseTargetKindsForGoal,
  type PulseTargetGoal,
  type PulseTargetKind,
} from "../../pulse/targets/kinds.ts";

/** A target request from Carmen's tool arguments or a queued approval's tool_input. */
export type TargetInput = {
  clientId: string;
  platform: PulsePlatform;
  goal: PulseTargetGoal;
  kind: PulseTargetKind;
  value: number;
  campaignId: string | null;
};

/**
 * The target the arguments ask for, or the first thing wrong with them. The kind
 * defaults to the goal's first (CPL for leads, ROAS for ecommerce).
 */
export function parseTargetInput(
  args: Record<string, unknown>,
): TargetInput | { error: string } {
  const clientId = String(args.client_id ?? "").trim();
  if (!clientId) {
    return { error: "client_id נדרש" };
  }
  const platform = String(args.platform ?? "").trim();
  if (!isPulsePlatform(platform)) {
    return { error: "platform חייב להיות meta או google" };
  }
  const goal = String(args.goal ?? "").trim();
  if (!isPulseTargetGoal(goal)) {
    return { error: "goal חייב להיות leads או ecommerce" };
  }
  const kinds = pulseTargetKindsForGoal(goal);
  const kind = String(args.kind ?? "").trim() || kinds[0];
  if (!isTargetKind(kind) || !kinds.includes(kind)) {
    return {
      error: `סוג יעד ${kind} לא מתאים למטרה ${goal} (אפשר: ${kinds.join(", ")})`,
    };
  }
  const value = Number(args.value);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "value חייב להיות מספר חיובי" };
  }
  const campaignId = String(args.campaign_id ?? "").trim() || null;
  return { clientId, platform, goal, kind, value, campaignId };
}
