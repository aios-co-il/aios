/**
 * A call or meeting with the client that a group message reports as already
 * held ("בהמשך לפגישתנו", "דיברנו בטלפון"). The model names the message (its
 * transcript line), the kind and whether it was held, is planned, or is
 * asked about; the code keeps a held one only when the message's own words
 * are neither a question nor a plan. Without a usable model claim, narrow
 * markers find one. A message of an unknown sender never counts. The contact
 * is drafted beside the summary and written only on a staff member's
 * approval (_shared/manager-round/card-contact.ts).
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

const HELD: readonly { kind: "call" | "meeting"; pattern: RegExp }[] = [
  {
    kind: "call",
    pattern:
      /דיברנו\s+(?:(?:עכשיו|היום|אתמול)\s+)?(?:ב?טלפון|טלפונית)|שוחחנו|בהמשך\s+לשיח(?:תנו|ה\s+(?:שלנו|הטלפונית|בטלפון|היום|מאתמול))|סיכמנו\s+בטלפון/,
  },
  {
    kind: "meeting",
    pattern:
      /בהמשך\s+ל(?:פגישתנו|פגישה\s+(?:שלנו|היום|מאתמול))|נפגשנו|סיכמנו\s+בפגישה|סיכום\s+ה?פגישה/,
  },
];

const PLANNED =
  /נדבר|נקבע|לקבוע|נתאם|לתאם|ניפגש|נפגש(?!נו)|אתקשר|נתקשר|תתקשר|מחר|בשבוע\s+הבא/;

const QUOTE_CHARS = 120;

/** The model's contact claim (its JSON answer's `contact`), or null. */
export function parseContactClaim(raw: Json | undefined): ContactClaim | null {
  const claim = jsonObject(raw);
  const tense = CONTACT_TENSES.find((known) => known === claim?.tense);
  const [line, kind, text] = [claim?.line, claim?.kind, claim?.text];
  return typeof line === "number" &&
    Number.isInteger(line) &&
    isContactUpdateType(kind) &&
    tense
    ? { line, kind, tense, text: typeof text === "string" ? text : "" }
    : null;
}

/** The held contact the model found, else the one the markers find, else null. */
export function pastContact(
  window: GroupWindow,
  claim: ContactClaim | null,
): PastContact | null {
  return modelContact(window, claim) ?? markerContact(window);
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
 * What a message's words say about a call or meeting: held ("past"), asked
 * about (the clause naming it ends with "?"), planned, or nothing known.
 */
export function contactTense(text: string): ContactTense | null {
  const held = text.split(/(?<=[.!?\n,])/).find((clause) => heldKind(clause));
  if (held) {
    return held.trim().endsWith("?") ? "question" : "past";
  }
  if (PLANNED.test(text)) {
    return "planned";
  }
  return text.trim().endsWith("?") ? "question" : null;
}

/** The model's held contact, unless its message reads as a question or a plan. */
function modelContact(
  window: GroupWindow,
  claim: ContactClaim | null,
): PastContact | null {
  const message = claim ? window.messages[claim.line - 1] : undefined;
  if (!claim || claim.tense !== "past" || !message || !counts(message)) {
    return null;
  }
  const tense = contactTense(message.text);
  if (tense === "question" || tense === "planned") {
    return null;
  }
  const text = clamp(maskPhones(claim.text), MAX_ITEM_CHARS);
  return { kind: claim.kind, message, text: text || quote(message) };
}

/** The newest message whose words report a held call or meeting. */
function markerContact(window: GroupWindow): PastContact | null {
  const message = [...window.messages]
    .reverse()
    .find((m) => counts(m) && contactTense(m.text) === "past");
  const kind = message ? heldKind(message.text) : null;
  return message && kind ? { kind, message, text: quote(message) } : null;
}

/** The kind of held contact the text names, or null. */
function heldKind(text: string): "call" | "meeting" | null {
  return HELD.find((marker) => marker.pattern.test(text))?.kind ?? null;
}

/** A message of the client or the staff (never an unknown sender). */
function counts(message: WindowMessage): boolean {
  return message.speaker !== "unknown";
}

/** The message quoted, phones masked. */
function quote(message: WindowMessage): string {
  return `הודעה בקבוצה: "${clamp(maskPhones(message.text), QUOTE_CHARS)}"`;
}
