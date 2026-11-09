import { getArray, getPath, getString } from "../_shared/provider-json.ts";

/** Display text for a Green API message, by its typeMessage. */
export function extractMessageText(
  messageData: unknown,
  typeMessage: string,
): string {
  if (typeMessage === "textMessage") {
    return (
      getString(messageData, "textMessageData", "textMessage") ||
      getString(messageData, "textMessage") ||
      ""
    );
  } else if (typeMessage === "extendedTextMessage") {
    return (
      getString(messageData, "extendedTextMessageData", "text") ||
      getString(messageData, "extendedTextMessage", "text") ||
      ""
    );
  } else if (typeMessage === "imageMessage") {
    return (
      getString(messageData, "fileMessageData", "caption") ||
      getString(messageData, "caption") ||
      "[תמונה]"
    );
  } else if (typeMessage === "videoMessage") {
    return (
      getString(messageData, "fileMessageData", "caption") ||
      getString(messageData, "caption") ||
      "[וידאו]"
    );
  } else if (typeMessage === "audioMessage") {
    return "[הודעת קול · transcription_failed]";
  } else if (typeMessage === "documentMessage") {
    return (
      getString(messageData, "fileMessageData", "caption") ||
      `[מסמך: ${getString(messageData, "fileMessageData", "fileName") || getString(messageData, "fileName") || "קובץ"}]`
    );
  } else if (typeMessage === "templateMessage") {
    return (
      getString(messageData, "templateMessage", "contentText") ||
      getString(messageData, "templateMessage", "titleText") ||
      "[הודעת תבנית]"
    );
  } else if (typeMessage === "buttonsMessage") {
    return (
      getString(messageData, "buttonsMessage", "contentText") ||
      "[הודעת כפתורים]"
    );
  } else if (typeMessage === "listMessage") {
    return (
      getString(messageData, "listMessage", "description") ||
      getString(messageData, "listMessage", "title") ||
      "[הודעת רשימה]"
    );
  } else if (typeMessage === "contactMessage") {
    const contactData = getPath(messageData, "contactMessageData");
    if (contactData) {
      const displayName = getString(contactData, "displayName") || "איש קשר";
      const vcard = getString(contactData, "vcard") || "";
      const phoneMatch = vcard.match(/TEL[^:]*:([+\d\s-]+)/i);
      const phoneFromVcard = phoneMatch ? phoneMatch[1].replace(/\s/g, "") : "";
      return `[איש קשר: ${displayName}${phoneFromVcard ? ` - ${phoneFromVcard}` : ""}]`;
    }
    return "[איש קשר]";
  } else if (typeMessage === "contactsArrayMessage") {
    const contacts = getArray(
      messageData,
      "contactsArrayMessageData",
      "contacts",
    );
    const contactNames = contacts
      .map((c) => getString(c, "displayName") || "איש קשר")
      .join(", ");
    return `[אנשי קשר: ${contactNames || "מספר אנשי קשר"}]`;
  } else if (typeMessage === "locationMessage") {
    const nameLocation = getString(
      messageData,
      "locationMessageData",
      "nameLocation",
    );
    return `[מיקום${nameLocation ? ": " + nameLocation : ""}]`;
  } else if (typeMessage === "stickerMessage") {
    return "[סטיקר]";
  } else if (typeMessage === "reactionMessage") {
    const reaction =
      getString(messageData, "reactionMessage", "reaction") ||
      getString(messageData, "extendedTextMessageData", "text") ||
      "👍";
    return `[תגובה: ${reaction}]`;
  } else {
    return `[${typeMessage}]`;
  }
}
