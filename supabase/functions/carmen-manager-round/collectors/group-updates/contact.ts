/**
 * A call or meeting with the client that a group message reports as already
 * held ("בהמשך לפגישתנו", "דיברנו בטלפון"). Only the model proposes one: it
 * names the message (its transcript line), the kind and whether it was held,
 * is planned, or is asked about, and only a held one is taken. Without a
 * usable model answer there is no contact (the digest's own markers never
 * propose one). The message must be one a person typed (authorship.ts),
 * and its own words must pass contactRefusal. The contact is drafted beside
 * the summary and written only on a staff member's approval
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

// Phrases naming a call or meeting. They never propose a contact; they only
// find the clause contactRefusal reads.
const NAMES_CONTACT =
  /(?:דיברנו|שוחחנו)\s+(?:עם\s+\S+\s+)?(?:(?:עכשיו|היום|אתמול|הבוקר)\s+)?(?:ב?טלפון|טלפונית)|בהמשך\s+ל(?:שיח|פגיש)(?:תנו|ה\s+(?:שלנו|הטלפונית|בטלפון|היום|מאתמול))|נפגשנו|סיכמנו\s+ב(?:טלפון|פגישה)|סיכום\s+ה?פגישה/;

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
 * The held contact the model's claim names, unless the message was not typed
 * by a person or its words refuse it; null without a claim.
 */
export function pastContact(
  window: GroupWindow,
  claim: ContactClaim | null,
): PastContact | null {
  const message = claim ? window.messages[claim.line - 1] : undefined;
  if (!claim || claim.tense !== "past" || !message) {
    return null;
  }
  if (!message.typedByPerson || contactRefusal(message.text)) {
    return null;
  }
  const text = clamp(maskPhones(claim.text), MAX_ITEM_CHARS);
  return { kind: claim.kind, message, text: text || quoted(message) };
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

/** The clause that names a call or meeting, else the whole message. */
function contactClause(text: string): string {
  return (
    text.split(/(?<=[.!?\n,])/).find((clause) => NAMES_CONTACT.test(clause)) ??
    text
  );
}
