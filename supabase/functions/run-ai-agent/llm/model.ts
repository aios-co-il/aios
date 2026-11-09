import { resolveModelId } from "../../_shared/models.ts";
// kept for reference only

/** Preserves the existing resolveModel provider boundary. */
export function resolveModel(engine: string): string {
  return resolveModelId(engine);
}
