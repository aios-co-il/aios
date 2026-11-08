import { z } from "npm:zod@3.25.76";

const delegationSchema = z
  .object({
    agent_id: z.string().optional().catch(undefined),
    sub_goal: z.string().optional().catch(undefined),
  })
  .catch({});

/** One routing choice from the LLM; fields are validated strings. */
export type Delegation = z.infer<typeof delegationSchema>;

const routingSchema = z
  .object({ delegations: z.array(delegationSchema) })
  .catch({ delegations: [] });

/** The delegations of the routing LLM's JSON answer; [] for invalid JSON or shapes. */
export function parseRoutingDelegations(content: string): Delegation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  return routingSchema.parse(parsed).delegations;
}
