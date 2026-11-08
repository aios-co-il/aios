// Stored rows are validated as the same domain payloads consumed by the worker.
import { taskMemorySchema, chatMemorySchema } from "../_shared/memory-event.ts";
export type {
  TaskMemory as LegacyTaskRow,
  ChatMemory as LegacyMessageRow,
} from "../_shared/memory-event.ts";
/** Validate task identifiers and the nullable text fields used by indexing. */
export function readLegacyTaskRow(value: unknown) {
  const parsed = taskMemorySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
/** Validate message identifiers and the nullable text fields used by indexing. */
export function readLegacyMessageRow(value: unknown) {
  const parsed = chatMemorySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
