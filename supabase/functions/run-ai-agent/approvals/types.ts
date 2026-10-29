import type { Tables } from "../../_shared/database.types.ts";

/** The agent_approval_queue columns the chat picker reads. */
export type PickRow = Pick<
  Tables<"agent_approval_queue">,
  | "id"
  | "action_type"
  | "title"
  | "description"
  | "tool_name"
  | "tool_input"
  | "context"
  | "created_at"
  | "status"
  | "requested_by"
  | "expires_at"
  | "run_id"
>;

/** Which pending row a reply refers to, plus the rows the caller could pick by code. */
export type ApprovalPick = {
  candidates: PickRow[];
  pickable: PickRow[];
  blocked: number;
} & (
  | { kind: "match"; via: "bound" | "code"; row: PickRow }
  | { kind: "forbidden"; via: "bound"; row: PickRow; reason: string | null }
  | { kind: "ambiguous"; via: "bound" | "code" }
  | { kind: "code_not_found"; code: string }
  | { kind: "none" | "no_identity" }
);
