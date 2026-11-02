import { assertEquals } from "jsr:@std/assert@1";
import {
  classifyGatewayReply,
  deliverManusMedia,
  type DeliverInput,
  mediaRequest,
} from "./gateway.ts";

const GROUP = "120363416882903532@g.us";

const groupImage: DeliverInput = {
  instanceId: "inst-1",
  apiKey: "key",
  to: GROUP,
  isGroup: true,
  media: {
    url: "https://signed.example/report.png",
    isImage: true,
    mimeType: "image/png",
    filename: "report.png",
  },
  caption: "הדוח החודשי\n📊 https://aios.co.il/shared/table/t1",
  captionFallback: true,
};

type Call = { url: string; body: Record<string, unknown> };

/** A fetch that answers each call with the next scripted reply. */
function scriptedFetch(replies: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetcher = (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const reply = replies.shift();
    if (!reply || reply instanceof Error) {
      return Promise.reject(reply ?? new Error("no reply scripted"));
    }
    return Promise.resolve(reply);
  };
  return { calls, fetcher };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

Deno.test("mediaRequest sends a group file to the group's chat id", () => {
  assertEquals(mediaRequest(groupImage), {
    path: "send/image",
    body: {
      to: GROUP,
      caption: groupImage.caption,
      filename: "report.png",
      imageUrl: "https://signed.example/report.png",
    },
  });
  const docx = mediaRequest({
    ...groupImage,
    caption: "",
    media: {
      url: "https://signed.example/summary.docx",
      isImage: false,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "סיכום פגישה.docx",
    },
  });
  assertEquals(docx.path, "send/file");
  assertEquals(docx.body.to, GROUP);
  assertEquals(docx.body.fileUrl, "https://signed.example/summary.docx");
  assertEquals(docx.body.caption, undefined);
});

Deno.test("classifyGatewayReply", () => {
  assertEquals(classifyGatewayReply(200, '{"success":true,"messageId":"m1"}'), {
    kind: "ok",
    messageId: "m1",
  });
  // The web app's HTML for an unknown route is not a send.
  assertEquals(classifyGatewayReply(200, "<!doctype html><html>"), {
    kind: "rejected",
  });
  assertEquals(classifyGatewayReply(200, '{"success":false}'), {
    kind: "rejected",
  });
  assertEquals(classifyGatewayReply(400, '{"error":"bad"}'), {
    kind: "rejected",
  });
  assertEquals(classifyGatewayReply(502, "bad gateway"), { kind: "failed" });
});

Deno.test("deliverManusMedia", async (t) => {
  await t.step("sends the media to the group", async () => {
    const { calls, fetcher } = scriptedFetch([ok({ messageId: "m1" })]);
    const outcome = await deliverManusMedia(fetcher, groupImage);
    assertEquals(outcome, {
      status: "sent",
      messageId: "m1",
      deliveredAs: "media",
    });
    assertEquals(calls.length, 1);
    assertEquals(
      calls[0].url,
      "https://whatsappgw-pzpyrrww.manus.space/api/v1/instances/inst-1/send/image",
    );
    assertEquals(calls[0].body.to, GROUP);
  });

  await t.step(
    "a rejected group media send falls back to the caption once",
    async () => {
      const { calls, fetcher } = scriptedFetch([
        new Response('{"error":"groups not supported"}', { status: 400 }),
        ok({ messageId: "t1" }),
      ]);
      const outcome = await deliverManusMedia(fetcher, groupImage);
      assertEquals(outcome, {
        status: "sent",
        messageId: "t1",
        deliveredAs: "text_fallback",
      });
      assertEquals(calls.length, 2);
      assertEquals(calls[1].url.endsWith("/send/group"), true);
      assertEquals(calls[1].body, { groupId: GROUP, body: groupImage.caption });
    },
  );

  await t.step("a timeout is unknown and never sends again", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const { calls, fetcher } = scriptedFetch([timeout]);
    const outcome = await deliverManusMedia(fetcher, groupImage);
    assertEquals(outcome, { status: "unknown", detail: "TimeoutError" });
    assertEquals(calls.length, 1);
  });

  await t.step("a server error is a failure without a fallback", async () => {
    const { calls, fetcher } = scriptedFetch([
      new Response("upstream", { status: 503 }),
    ]);
    const outcome = await deliverManusMedia(fetcher, groupImage);
    assertEquals(outcome.status, "failed");
    assertEquals(calls.length, 1);
  });

  await t.step(
    "no fallback for a private chat or without opting in",
    async () => {
      for (const input of [
        { ...groupImage, isGroup: false, to: "972501234567" },
        { ...groupImage, captionFallback: false },
      ]) {
        const { calls, fetcher } = scriptedFetch([
          new Response('{"success":false}', { status: 200 }),
        ]);
        const outcome = await deliverManusMedia(fetcher, input);
        assertEquals(outcome.status, "rejected");
        assertEquals(calls.length, 1);
      }
    },
  );
});
