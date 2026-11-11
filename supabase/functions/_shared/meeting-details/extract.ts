// The meeting name and client the model reads from a summary (AIO-563).
import { aiChatJSON } from "../ai.ts";
import {
  type ClientOption,
  type MeetingDetails,
  parseMeetingDetails,
} from "./plan.ts";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DETAILS_MODEL_OPENROUTER = "anthropic/claude-sonnet-5.5";
const MAX_SUMMARY_CHARS = 24_000;

export interface MeetingDetailsKeys {
  openRouterKey: string;
}

/** The model's meeting name and client for a summary; a client not in the list is dropped. */
export async function extractMeetingDetails(
  summary: string,
  clients: Array<ClientOption>,
  keys: MeetingDetailsKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<MeetingDetails> {
  const prompt = buildDetailsPrompt(summary, clients);
  const raw = keys.openRouterKey
    ? await openRouterJson(prompt, keys.openRouterKey, fetchImpl)
    : await aiChatJSON<Record<string, unknown>>(prompt);
  return parseMeetingDetails(raw, clients);
}

/** The extraction prompt: the summary and the tenant's clients. */
function buildDetailsPrompt(
  summary: string,
  clients: Array<ClientOption>,
): string {
  const clientList = clients.map((c) => `${c.id} | ${c.name}`).join("\n");
  return `קרא את סיכום הפגישה והחזר JSON בלבד בפורמט {"title": string, "client_id": string | null}.

title: שם קצר לפגישה בעברית (עד 60 תווים) שמתאר מה נדון בה, בפורמט "<לקוח או משתתפים> — <נושא>". בלי תאריך.
client_id: המזהה של הלקוח מהרשימה רק אם ברור מהסיכום שהפגישה עוסקת בלקוח הזה. אם הפגישה פנימית, עוסקת בכמה לקוחות או שאין ודאות, החזר null. אל תמציא מזהה.

רשימת לקוחות (מזהה | שם):
${clientList || "(אין לקוחות)"}

סיכום הפגישה:
${summary.slice(0, MAX_SUMMARY_CHARS)}`;
}

/** One JSON answer from the tenant's OpenRouter model; throws on a provider error. */
async function openRouterJson(
  prompt: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const res = await fetchImpl(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Carmen Marketing OS",
    },
    body: JSON.stringify({
      model: DETAILS_MODEL_OPENROUTER,
      temperature: 0,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `OpenRouter meeting details returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const data = await res.json();
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
