import type { Db } from "./db.ts";
import type { WorkshopDeps } from "./gate.ts";

/** What every workshop tool handler receives from the dispatcher. */
export interface ToolContext {
  supabase: Db;
  tenantId: string;
  name: string;
  args: Record<string, unknown>;
  assertClientAccess: (clientId: string) => Promise<void>;
  userId: string | null;
  deps: WorkshopDeps;
}
