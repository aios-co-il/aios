import type { ChatTurn } from "./answer.ts";
import type { Surface } from "../surface.ts";
import type { FastLaneCaller } from "./scope.ts";

/** A chat turn the fast lane may answer, with what it needs to save the reply. */
export type FastLaneRequest = {
  tenantId: string;
  userId: string | null;
  callerName: string | null;
  agentId: string;
  agentName: string;
  /** The AIOS chat's conversation; WhatsApp keeps its own history. */
  conversationId: string | null;
  history: Array<ChatTurn>;
  message: string;
  surface: Surface;
  caller: FastLaneCaller;
};
