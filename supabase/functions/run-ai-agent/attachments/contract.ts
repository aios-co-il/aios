/**
 * The `attachments` field of a run-ai-agent request (AIO-675): the pictures the user attached
 * to this message in the site chat, named by storage path. Pure, so the browser imports it.
 */
import type { ChannelAttachment } from "../../_shared/agent-channel/types.ts";

/**
 * One attached picture as the chat sends it: its path in the caller's own folder of
 * `COMMAND_CENTER_FILES_BUCKET`, never an address. The server reads the bytes itself.
 */
export type TurnPictureAttachment = Pick<ChannelAttachment, "name"> & {
  type: "image";
  path: string;
  size?: number;
};

/** How many pictures one message may carry to the brain. */
export const MAX_TURN_PICTURES = 4;

/** The largest picture the brain is sent, in megabytes and in bytes. */
export const MAX_PICTURE_MB = 5;
export const MAX_PICTURE_BYTES = MAX_PICTURE_MB * 1024 * 1024;

/**
 * The most the pictures of one message may weigh together. Every tool round sends them
 * again as base64 inside the request, so this bounds the edge worker's memory and keeps the
 * request under the smallest inline limit of the providers.
 */
export const MAX_TURN_PICTURES_MB = 8;
export const MAX_TURN_PICTURES_BYTES = MAX_TURN_PICTURES_MB * 1024 * 1024;
