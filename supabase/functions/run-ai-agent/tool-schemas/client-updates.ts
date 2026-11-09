import { CLIENT_CARD_SOURCES } from "../../_shared/client-card/sources.ts";

export const clientUpdatesTools = [
  // UPDATES
  {
    name: "list_updates",
    description: `רשימת עדכונים ללקוח או ליד. ללקוח: כולל מי רשם (author), סוג העדכון (update_type) ומקור (source: ${CLIENT_CARD_SOURCES.join(" / ")}).`,
    parameters: {
      type: "object",
      properties: {
        entity_type: { type: "string", enum: ["client", "lead"] },
        entity_id: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["entity_type", "entity_id"],
    },
  },
];
