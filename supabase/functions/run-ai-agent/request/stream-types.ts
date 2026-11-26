import type { AgentRequestBody } from "./types.ts";
import type { Surface } from "../surface.ts";
import type { RunInputs } from "../run/contracts.ts";
import type { handleRunAgent } from "../run/handle.ts";
import type { saveCarmenReply } from "../../_shared/carmen/background-reply.ts";

export interface AgentStreamInput {
  req: Request;
  bodyJson: AgentRequestBody;
  surface: Surface;
  authKind: string;
  brainEngine?: RunInputs["brainEngine"];
  internalTail?: RunInputs["internalTail"];
}

export interface AgentStreamDependencies {
  createClient: (
    url: string,
    key: string,
  ) => import("../../_shared/supabase-clients.ts").DbClient;
  handleRunAgent: typeof handleRunAgent;
  saveCarmenReply: typeof saveCarmenReply;
}
