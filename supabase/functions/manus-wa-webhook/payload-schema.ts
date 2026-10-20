import { z } from "npm:zod@3.25.76";

// Keep provider values intact: IDs may be numeric, flags may use gateway strings,
// nulls trigger the existing fallback logic, and unknown fields pass through.
const identifier = z.union([z.string(), z.number().finite()]).nullish();
const text = z.string().nullish();
const flag = z
  .union([
    z.boolean(),
    z.literal("true"),
    z.literal("false"),
    z.literal(0),
    z.literal(1),
  ])
  .nullish();

const media = z
  .object({
    url: text,
    downloadUrl: text,
    mediaUrl: text,
    mimetype: text,
    mimeType: text,
    mime_type: text,
  })
  .passthrough();

const key = z
  .object({
    id: identifier,
    remoteJid: identifier,
    participant: identifier,
    fromMe: flag,
  })
  .passthrough()
  .nullish();

// The gateway uses the same message fields at the top level and inside wrappers.
// Do not restrict event/direction strings to today's vocabulary or coerce values.
export const manusPayloadSchema: z.ZodType<Record<string, unknown>> = z.lazy(
  () =>
    z
      .object({
        event: text,
        type: text,
        messageType: text,
        instanceId: identifier,
        instance_id: identifier,
        secret: text,
        id: identifier,
        messageId: identifier,
        from: identifier,
        to: identifier,
        chatId: identifier,
        remoteJid: identifier,
        recipientId: identifier,
        participant: identifier,
        participantPn: identifier,
        senderPn: identifier,
        senderLid: identifier,
        senderPhone: identifier,
        senderNumber: identifier,
        author: identifier,
        senderName: text,
        fromName: text,
        authorName: text,
        pushName: text,
        groupId: identifier,
        groupName: text,
        chatName: text,
        subject: text,
        fromMe: flag,
        hasMedia: flag,
        direction: text,
        ack: identifier,
        body: z.union([z.string(), manusPayloadSchema]).nullish(),
        text: z.union([z.string(), manusPayloadSchema]).nullish(),
        content: z.union([z.string(), manusPayloadSchema]).nullish(),
        conversation: text,
        data: manusPayloadSchema.nullish(),
        payload: manusPayloadSchema.nullish(),
        message: manusPayloadSchema.nullish(),
        key,
        contextInfo: z
          .object({ stanzaId: identifier, participant: identifier })
          .passthrough()
          .nullish(),
        quotedMsgId: identifier,
        quotedMessageId: identifier,
        quotedMsg: z.object({ id: identifier }).passthrough().nullish(),
        mediaType: text,
        mimeType: text,
        mime_type: text,
        media: z.union([z.string(), media]).nullish(),
        file: z.union([z.string(), media]).nullish(),
        attachment: z.union([z.string(), media]).nullish(),
        audio: z.union([z.string(), media]).nullish(),
        audioMessage: media.nullish(),
        imageMessage: media.nullish(),
        videoMessage: media.nullish(),
        documentMessage: media.nullish(),
      })
      .passthrough(),
);
