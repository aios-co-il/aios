import { assertEquals } from "jsr:@std/assert@1";
import { readFileSendRequest } from "./request.ts";

const URL_ = "https://example.supabase.co/functions/v1/send-manus-wa-file";

Deno.test("readFileSendRequest", async (t) => {
  await t.step("reads a broadcast's JSON image by URL", async () => {
    const request = await readFileSendRequest(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupId: "g1",
          imageUrl: "https://cdn.example/a.png",
          caption: "\nשלום",
          tenantId: "t1",
          integrationId: "i1",
          senderUserId: "u1",
          sendKind: "broadcast",
          sendRef: "b1",
        }),
      }),
    );
    if ("error" in request) {
      throw new Error(request.error);
    }
    assertEquals(request.groupId, "g1");
    assertEquals(request.caption, "\nשלום");
    assertEquals(request.captionFallback, false);
    assertEquals(request.sendKind, "broadcast");
    assertEquals(request.media, {
      kind: "url",
      url: "https://cdn.example/a.png",
      isImage: true,
      mimeType: "application/octet-stream",
      filename: null,
    });
  });

  await t.step("reads a browser's multipart screenshot", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1, 2])], "r.png", { type: "image/png" }),
    );
    form.append("tenantId", "t1");
    form.append("groupId", "g1");
    form.append("phoneNumber", "0501234567");
    form.append("integrationId", "i1");
    form.append("caption", "דוח");
    form.append("captionFallback", "true");
    form.append("sendKind", "report");
    form.append("sendRef", "table-1");
    const request = await readFileSendRequest(
      new Request(URL_, { method: "POST", body: form }),
    );
    if ("error" in request) {
      throw new Error(request.error);
    }
    assertEquals(request.media.kind, "upload");
    assertEquals(request.media.isImage, true);
    assertEquals(request.captionFallback, true);
    assertEquals(request.phoneNumber, "0501234567");
    assertEquals([request.sendKind, request.sendRef], ["report", "table-1"]);
  });

  await t.step("refuses a body without media", async () => {
    const json = await readFileSendRequest(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: "g1" }),
      }),
    );
    assertEquals(json, { error: "Missing fileUrl or imageUrl" });
    const form = new FormData();
    form.append("tenantId", "t1");
    const multipart = await readFileSendRequest(
      new Request(URL_, { method: "POST", body: form }),
    );
    assertEquals(multipart, { error: "No file provided" });
  });
});
