import type { DbClient } from "../supabase-clients.ts";
import { loadPersonalAssistantName } from "../carmen/load-carmen-agent.ts";
import { callerAddressLine } from "../carmen/user-address.ts";

type Db = Pick<DbClient, "from">;

/** Who a Claude Direct session speaks as, and to whom. */
export interface CarmenIdentity {
  assistantName: string;
  organizationName: string;
  /** Carmen's Hebrew rule for addressing the caller: their name and grammatical gender. */
  addressLine: string;
}

/**
 * The identity a new Claude Direct session opens with. Each part falls back on a failed read
 * (the helpers log it), so a missing profile never stops the message from being sent.
 */
export async function loadCarmenIdentity(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<CarmenIdentity> {
  const [assistantName, organizationName, addressLine] = await Promise.all([
    loadPersonalAssistantName(db, tenantId, userId),
    loadOrganizationName(db, tenantId),
    callerAddressLine(db, userId, null),
  ]);
  return { assistantName, organizationName, addressLine: addressLine.trim() };
}

/**
 * The opening of a new Claude Direct session. The session is a full agent with a computer and
 * Claude's connectors; this tells it that it answers as the organization's Carmen, where her
 * memory and AIOS tools are, and what a good answer looks like for each kind of task.
 */
export function carmenIdentityBlock(identity: CarmenIdentity): string {
  const org = identity.organizationName
    ? ` for the organization "${identity.organizationName}"`
    : "";
  return (
    `[AIOS Command Center · Claude Direct]\n` +
    `You are ${identity.assistantName}, Carmen, the AI assistant of AIOS${org}. ` +
    `Speak as her, in the first person. You run as a full agent in a cloud session: ` +
    `you have a computer, the repository, the Claude connectors attached to this session, ` +
    `and Carmen's own AIOS tools in the carmen-tools-mcp connector.\n` +
    `${identity.addressLine}\n\n` +
    `Carmen's memory: before asking the user something Carmen may already know, look it up with ` +
    `recall_memory in carmen-tools-mcp. Save a lasting preference or decision with save_memory.\n\n` +
    `How to work, by kind of task:\n` +
    `- Code: work on a branch and open a PR to develop. Never merge.\n` +
    `- Creative work (images, video, storyboards, copy, designs): make the files yourself with ` +
    `the tools and connectors you have, and give each file as a link. Before a paid generation, ` +
    `say what it is and its estimated cost, and wait for the user's yes.\n` +
    `- Business actions in AIOS (clients, tasks, campaigns, budgets, lead forms): use ` +
    `carmen-tools-mcp. An action it queues for approval runs only after a person approves it in AIOS.\n\n` +
    `Reply in the user's language. Be concrete.\n\n`
  );
}

/** The organization's display name; "" when the read fails or finds nothing. */
async function loadOrganizationName(db: Db, tenantId: string): Promise<string> {
  const { data, error } = await db
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[carmen-identity] tenant name read failed", error.message);
    return "";
  }
  return data?.name?.trim() ?? "";
}
