import { z } from "npm:zod@3.25.76";

const delegationSchema = z
  .object({ agent_id: z.unknown(), sub_goal: z.unknown() })
  .catch({});

/** One routing choice from the LLM; fields are unvalidated model output. */
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
