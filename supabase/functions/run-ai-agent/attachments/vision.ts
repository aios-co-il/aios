/**
 * Which brains can read a picture. The model catalog's `capabilities` is the only source:
 * a model sees when its entry lists "vision".
 */
import { MODEL_CATALOG } from "../../_shared/models.ts";
import type { LLMTarget } from "../llm/contracts.ts";

/** The part of a chain link that decides whether it can see. */
export type VisionTarget = Pick<LLMTarget, "label" | "connectionId">;

/**
 * Whether this link of the model chain is sent the pictures. Only Carmen's own engine on a
 * catalog model that sees: its label is the catalog id (buildLLMChain). A connected brain
 * (`connectionId`) is not sent pictures: no one has checked what each endpoint accepts.
 */
export function targetCanSee(target: VisionTarget): boolean {
  return (
    !target.connectionId &&
    MODEL_CATALOG.some(
      (model) =>
        model.id === target.label && model.capabilities?.includes("vision"),
    )
  );
}

/** The current catalog models that read pictures, by the name the engine picker shows. */
export function enginesThatSee(): Array<string> {
  return MODEL_CATALOG.filter(
    (model) => model.isLatest && model.capabilities?.includes("vision"),
  ).map((model) => model.label);
}
