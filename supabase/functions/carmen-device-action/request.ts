/**
 * What the panel asks: to claim an action it was handed the id of, or to complete the one
 * it claimed. Anything else is refused before any read.
 */
import { bodyUuid } from "../_shared/agent-runs/body-id.ts";
import { type ActionReport, parseReport } from "./report.ts";

export type DeviceActionRequest =
  | { action: "claim"; id: string }
  | { action: "complete"; id: string; report: ActionReport };

/** The request, or null when the body is not one. */
export function parseRequest(body: unknown): DeviceActionRequest | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const input: Record<string, unknown> = { ...body };
  const id = bodyUuid(input.id);
  if (!id) {
    return null;
  }

  if (input.action === "claim") {
    return { action: "claim", id };
  }
  const report = input.action === "complete" ? parseReport(input) : null;

  return report ? { action: "complete", id, report } : null;
}
