/** The coding agents a dev task goes to, and the names users write for them. */
import { normalizeApprovalText } from "./wa-approval-flow.ts";

/** The coding agents Carmen sends work to, by the names users write for them. */
export const AGENT_SPELLINGS = {
  cursor: ["קרסר", "קורסור", "cursor"],
  claude: ["קלוד", "claude"],
  grok: ["גרוק", "grok"],
  manus: ["מנוס", "מאנוס", "manus"],
  github: ["גיטהאב", "github"],
};

export type DevAgent = keyof typeof AGENT_SPELLINGS;

export const AGENT_WORDS = Object.values(AGENT_SPELLINGS).flat();

/** One of these names as a word of its own, maybe after "ל" ("לקרסר"): "מנוסה" is not Manus. */
export const asWord = (names: string[]) =>
  `(?<![א-תa-z0-9])(?:ו?ל-?)?(?:${names.join("|")})(?![א-תa-z0-9])`;

const AGENT_NAME = Object.fromEntries(
  Object.entries(AGENT_SPELLINGS).map(([agent, names]) => [
    agent,
    new RegExp(asWord(names), "iu"),
  ]),
) as Record<DevAgent, RegExp>;

/** The coding agent the user's yes names ("כן, לקלוד"), if exactly one. */
export function namedDevAgent(text: unknown): DevAgent | null {
  const t = normalizeApprovalText(text);
  const named = (Object.keys(AGENT_NAME) as DevAgent[]).filter((agent) =>
    AGENT_NAME[agent].test(t),
  );
  return named.length === 1 ? named[0] : null;
}
