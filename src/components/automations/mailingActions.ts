import { ListMinus, ListPlus, Send, type LucideIcon } from "lucide-react";
import type { ListKind } from "@/lib/broadcastListKind";
import {
  MAILING_ACTION_TYPES,
  type MailingActionType,
} from "../../../supabase/functions/_shared/broadcast/mailing-actions/action-types.ts";

export { MAILING_ACTION_TYPES, type MailingActionType };

export interface MailingActionMeta {
  label: string;
  /** Shown above the action's configuration. */
  hint: string;
  needsList: boolean;
  needsTemplate: boolean;
  /** Shows the picker for which trigger entity (lead / client) to act on. */
  pickEntity: boolean;
  /** The list kinds the action can target. */
  listKinds: readonly ListKind[];
  /** Only lists built from a CRM filter. */
  crmFilterOnly: boolean;
  icon: LucideIcon;
}

const STORED_MEMBERS: readonly ListKind[] = ["static", "synced"];

/** The single registry of mailing automation actions: labels, hints, what
 * each one needs and its icon. */
export const MAILING_ACTIONS: Record<MailingActionType, MailingActionMeta> = {
  add_to_mailing_list: {
    label: "הוספה לרשימת דיוור",
    hint: "מכניס את הליד/הלקוח מהטריגר לרשימה קבועה או מסונכרנת. מתאים לטריגר שינוי סטטוס או שלב במשפך.",
    needsList: true,
    needsTemplate: false,
    pickEntity: true,
    listKinds: STORED_MEMBERS,
    crmFilterOnly: false,
    icon: ListPlus,
  },
  remove_from_mailing_list: {
    label: "הסרה מרשימת דיוור",
    hint: "מוציא את הליד/הלקוח מהטריגר מהרשימה.",
    needsList: true,
    needsTemplate: false,
    pickEntity: true,
    listKinds: STORED_MEMBERS,
    crmFilterOnly: false,
    icon: ListMinus,
  },
  send_template_to_contact: {
    label: "שליחת טמפלייט לאיש הקשר",
    hint: "שולח את הטמפלייט רק לאיש הקשר מהטריגר, דרך מנוע הדיוור (קצב שליחה, הסרה מרשימה, סטטיסטיקה). כל איש קשר מקבל טמפלייט זה פעם אחת לכל אוטומציה.",
    needsList: false,
    needsTemplate: true,
    pickEntity: true,
    listKinds: [],
    crmFilterOnly: false,
    icon: Send,
  },
  send_template_to_list: {
    label: "שליחת טמפלייט לרשימת דיוור",
    hint: "יוצר דיוור מלא מהטמפלייט לכל הרשימה. כדי למנוע הצפה – לא נשלח שוב לאותה רשימה לפני שעבר מרווח הזמן.",
    needsList: true,
    needsTemplate: true,
    pickEntity: false,
    listKinds: ["static", "synced", "dynamic"],
    crmFilterOnly: false,
    icon: Send,
  },
  sync_mailing_list: {
    label: "סנכרון לרשימת דיוור לפי הסינון",
    hint: "בודק אם הליד/הלקוח מהטריגר עונה עכשיו לסינון של הרשימה: אם כן – נכנס לרשימה, אם לא – יוצא ממנה. עבור רשימות שנוצרו מסינון CRM.",
    needsList: true,
    needsTemplate: false,
    pickEntity: false,
    listKinds: STORED_MEMBERS,
    crmFilterOnly: true,
    icon: ListPlus,
  },
};

/** `{ value, label }` options for the action pickers. */
export const MAILING_ACTION_OPTIONS = MAILING_ACTION_TYPES.map((value) => ({
  value,
  label: MAILING_ACTIONS[value].label,
}));

/** Labels keyed by action type, to spread into the label maps. */
export const MAILING_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  MAILING_ACTION_OPTIONS.map((o): [string, string] => [o.value, o.label]),
);

/** Icons keyed by action type, to spread into the icon maps. */
export const MAILING_ACTION_ICONS: Record<string, LucideIcon> =
  Object.fromEntries(
    MAILING_ACTION_TYPES.map((t): [string, LucideIcon] => [
      t,
      MAILING_ACTIONS[t].icon,
    ]),
  );

export function isMailingAction(
  t: string | null | undefined,
): t is MailingActionType {
  return MAILING_ACTION_TYPES.some((a) => a === t);
}
