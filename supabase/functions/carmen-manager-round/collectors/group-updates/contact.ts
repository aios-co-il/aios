/**
 * A call or meeting with the client that a group message reports as already
 * held ("בהמשך לפגישתנו", "דיברנו בטלפון"). When the model answered, only
 * its claim counts: it names the message (its transcript line), the kind and
 * whether it was held, is planned, or is asked about, and a planned or
 * asked-about contact, or none, is no contact. Only when the model could
 * not answer at all (off, over budget, slow, failed, every preview) do
 * narrow markers look for one. Either way the message's own words must pass
 * contactRefusal, and an unknown sender never counts. The contact is drafted
 * beside the summary and written only on a staff member's approval
 * (_shared/manager-round/card-contact.ts).
 */
import type { CarmenClientUpdateType } from "../../../_shared/client-card/sources.ts";
import type { Json } from "../../../_shared/database.types.ts";
import { isContactUpdateType } from "../../../_shared/manager-round/card-contact.ts";
import { jsonObject } from "../../../_shared/manager-round/json-object.ts";
import { clamp } from "./clamp.ts";
import {
  CONTACT_TENSES,
  type ContactTense,
  type Digest,
  MAX_ITEM_CHARS,
  MAX_UPDATE_CHARS,
} from "./digest.ts";
import { QUOTED_SPEAKER_HE } from "./fallback.ts";
import { maskPhones } from "./prompt.ts";
import type { GroupWindow, WindowMessage } from "./windows.ts";

/** The model's answer: the transcript line (#n), the kind, its tense and a short description. */
export type ContactClaim = {
  line: number;
  kind: CarmenClientUpdateType;
  tense: ContactTense;
  text: string;
};

export type PastContact = {
  kind: CarmenClientUpdateType;
  message: WindowMessage;
  /** The card's description: the model's, else the message quoted. */
  text: string;
};

/** Why a message's words cannot report a held call or meeting with the client. */
export type ContactRefusal =
  "question" | "negated" | "planned" | "not_client" | "in_group";

const HELD: readonly { kind: "call" | "meeting"; pattern: RegExp }[] = [
  {
    kind: "call",
    pattern:
      /(?:דיברנו|שוחחנו)\s+(?:עם\s+\S+\s+)?(?:(?:עכשיו|היום|אתמול|הבוקר)\s+)?(?:ב?טלפון|טלפונית)|בהמשך\s+לשיח(?:תנו|ה\s+(?:שלנו|הטלפונית|בטלפון|היום|מאתמול))|סיכמנו\s+בטלפון/,
  },
  {
    kind: "meeting",
    pattern:
      /בהמשך\s+ל(?:פגישתנו|פגישה\s+(?:שלנו|היום|מאתמול))|נפגשנו|סיכמנו\s+בפגישה|סיכום\s+ה?פגישה/,
  },
];

const NEGATED = /(?:^|[\s,.])[וש]?(?:לא|טרם)(?=\s)|אף\s+פעם/;
const PLANNED =
  /נדבר|נשוחח|נקבע|לקבוע|נתאם|לתאם|ניפגש|נפגש(?!נו)|להיפגש|אתקשר|נתקשר|תתקשר|מחר|בשבוע\s+הבא/;
// A talk or meeting "with" someone other than the client (a supplier, a name).
const NOT_CLIENT =
  /(?:דיברנו|דיברתי|שוחחנו|שוחחתי|נפגשנו|נפגשתי|לשיחתנו|לפגישתנו|לשיחה|לפגישה|בשיחה|בפגישה)(?:\s+\S+){0,2}?\s+עם\s+(?!(?:ה?לקוחה?|איתך|איתכם|איתכן|אתך|אתכם|אתכן)(?=[\s,.!?]|$))/;
// Talk in the group or in writing, not a call or a meeting.
const IN_GROUP = /בקבוצה|כאן|בצ['׳]?אט|בוו?א?טסאפ|בווצאפ|בהודע|במייל|בסמס/;

const QUOTE_CHARS = 120;

/**
 * The model's contact claim (its JSON answer's `contact`), or null. A claim
 * that is there but malformed is logged (no text), and is no contact.
 */
export function parseContactClaim(raw: Json | undefined): ContactClaim | null {
  const claim = jsonObject(raw);
  const tense = CONTACT_TENSES.find((known) => known === claim?.tense);
  const [line, kind, text] = [claim?.line, claim?.kind, claim?.text];
  if (
    typeof line === "number" &&
    Number.isInteger(line) &&
    isContactUpdateType(kind) &&
    tense
  ) {
    return { line, kind, tense, text: typeof text === "string" ? text : "" };
  }
  if (raw !== undefined && raw !== null) {
    console.warn(
      "[carmen-manager-round] group digest: malformed contact claim; no contact taken",
      JSON.stringify({ line, kind, tense: claim?.tense ?? null }),
    );
  }
  return null;
}

/**
 * The held contact: the model's claim when the model answered (`model` is
 * its answer, whatever the claim), the markers' only when it could not.
 */
export function pastContact(
  window: GroupWindow,
  model: { claim: ContactClaim | null } | null,
): PastContact | null {
  return model ? modelContact(window, model.claim) : markerContact(window);
}

/** A held contact is card news: it makes the digest material and, alone, its line. */
export function withContact(
  digest: Digest,
  contact: PastContact | null,
): Digest {
  return contact && !digest.material
    ? {
        ...digest,
        material: true,
        update_text: clamp(contact.text, MAX_UPDATE_CHARS),
      }
    : digest;
}

/**
 * Why the message cannot report a held call or meeting with the client, or
 * null. It reads the clause naming the contact (the whole message when no
 * marker names one): a question, a negation, a plan word, someone other
 * than the client, or talk in the group itself refuses it.
 */
export function contactRefusal(text: string): ContactRefusal | null {
  const clause = contactClause(text);
  if (clause.includes("?")) {
    return "question";
  }
  if (NEGATED.test(clause)) {
    return "negated";
  }
  if (PLANNED.test(clause)) {
    return "planned";
  }
  if (NOT_CLIENT.test(clause)) {
    return "not_client";
  }
  return IN_GROUP.test(clause) ? "in_group" : null;
}

/** The message as the approver and the card see it: its speaker and a masked quote. */
export function quoted(message: WindowMessage, max = QUOTE_CHARS): string {
  return `${QUOTED_SPEAKER_HE[message.speaker]}: "${clamp(maskPhones(message.text), max)}"`;
}

/** The model's held contact, unless its message's words refuse it. */
function modelContact(
  window: GroupWindow,
  claim: ContactClaim | null,
): PastContact | null {
  const message = claim ? window.messages[claim.line - 1] : undefined;
  if (!claim || claim.tense !== "past" || !message || !mayCount(message)) {
    return null;
  }
  const text = clamp(maskPhones(claim.text), MAX_ITEM_CHARS);
  return { kind: claim.kind, message, text: text || quoted(message) };
}

/** The newest message whose own words report a held call or meeting. */
function markerContact(window: GroupWindow): PastContact | null {
  for (const message of [...window.messages].reverse()) {
    const kind = heldKind(contactClause(message.text));
    if (kind && mayCount(message)) {
      return { kind, message, text: quoted(message) };
    }
  }
  return null;
}

/** A message of the client or the staff whose words do not refuse a contact. */
function mayCount(message: WindowMessage): boolean {
  return message.speaker !== "unknown" && !contactRefusal(message.text);
}

/** The clause that names a held call or meeting, else the whole message. */
function contactClause(text: string): string {
  return text.split(/(?<=[.!?\n,])/).find((clause) => heldKind(clause)) ?? text;
}

/** The kind of held contact the text names, or null. */
function heldKind(text: string): "call" | "meeting" | null {
  return HELD.find((marker) => marker.pattern.test(text))?.kind ?? null;
}
