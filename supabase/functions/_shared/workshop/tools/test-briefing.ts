/** The briefing tests' reading step: Carmen reads the request before the first questions. */
import {
  executeApprovedWorkshopTool,
  fakeDb,
  READ_NOTHING,
  type RunArgs,
} from "./test-fakes.ts";

/** A tool reply as the briefing tests read it. */
export interface Reply {
  needs_input?: boolean;
  missing?: Array<string>;
  say_to_user: string;
  carmen_next: string;
  reading?: boolean;
  success?: boolean;
  needs_budget?: boolean;
}

/**
 * The briefing's reading step, then the call that follows it in the same turn: the first call
 * asks Carmen to read the request (reading=true, nothing said to the user), and the second runs
 * on the project that call saved, with what she read (`read`, by default nothing).
 */
export async function afterReading(
  script: Record<string, unknown>,
  name: string,
  args: Record<string, unknown>,
  deps: RunArgs[6] = {},
  read: Record<string, unknown> = READ_NOTHING,
) {
  const first = fakeDb(script);
  const reading = (await executeApprovedWorkshopTool(
    first,
    "tenant-1",
    name,
    args,
    async () => {},
    null,
    deps,
  )) as Reply;
  const saved = first.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .at(-1)?.value as { payload: Record<string, unknown> } | undefined;
  const item = script["marketing_work_items:select"] as Record<string, unknown>;
  const db = fakeDb({
    ...script,
    "marketing_work_items:select": { ...item, payload: saved?.payload },
  });
  const result = (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    name,
    { ...args, ...read },
    async () => {},
    null,
    deps,
  )) as Reply;
  return { reading, db, result };
}
