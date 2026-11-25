import { resolveModelId } from "../../_shared/models.ts";

export function resolveModel(engine: string): string {
  return resolveModelId(engine);
}
