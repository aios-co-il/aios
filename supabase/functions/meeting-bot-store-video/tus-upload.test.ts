import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import { fixedSizeChunks, TUS_CHUNK_BYTES, tusUpload } from "./tus-upload.ts";

const ENDPOINT = "https://db.test/storage/v1/upload/resumable";

interface RecordedRequest {
  method: string;
  url: string;
  headers: Headers;
  bodyBytes: number;
}

interface FakeStorage {
  fetchFn: typeof fetch;
  requests: Array<RecordedRequest>;
}

/** A Storage TUS endpoint that accepts every chunk, unless `failPatchAt` names a PATCH index. */
function fakeStorage(
  opts: {
    failCreate?: boolean;
    failPatchAt?: number;
    wrongOffset?: boolean;
  } = {},
): FakeStorage {
  const requests: Array<RecordedRequest> = [];
  let held = 0;
  let patches = 0;
  return { fetchFn, requests };

  /** Records the request and answers as Storage would. */
  function fetchFn(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const body = init?.body;
    const bodyBytes = body instanceof Uint8Array ? body.byteLength : 0;
    const method = init?.method ?? "GET";
    requests.push({
      method,
      url: String(input),
      headers: new Headers(init?.headers),
      bodyBytes,
    });
    if (method === "POST") {
      if (opts.failCreate) {
        return Promise.resolve(
          new Response("bucket not found", { status: 404 }),
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 201,
          headers: { location: "/storage/v1/upload/resumable/upload-1" },
        }),
      );
    }
    if (patches++ === opts.failPatchAt) {
      return Promise.resolve(new Response("too large", { status: 413 }));
    }
    held += bodyBytes;
    const reported = opts.wrongOffset ? held - 1 : held;
    return Promise.resolve(
      new Response(null, {
        status: 204,
        headers: { "upload-offset": String(reported) },
      }),
    );
  }
}

/** A stream that yields `total` bytes in pieces of `pieceBytes`. */
function byteStream(
  total: number,
  pieceBytes: number,
): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const size = Math.min(pieceBytes, total - sent);
      controller.enqueue(new Uint8Array(size).fill(sent % 251));
      sent += size;
    },
  });
}

/** Uploads `total` bytes with the given chunk size to a fake. */
function upload(
  storage: FakeStorage,
  total: number,
  chunkBytes?: number,
  declared = total,
) {
  return tusUpload({
    endpoint: ENDPOINT,
    serviceKey: "service-key",
    bucket: "recordings",
    objectName: "tenant-1/meeting_bot/session-1.mp4",
    contentType: "video/mp4",
    body: byteStream(total, 5),
    length: declared,
    fetchFn: storage.fetchFn,
    chunkBytes,
  });
}

describe("tusUpload", () => {
  it("creates the upload with its length, metadata and upsert", async () => {
    const storage = fakeStorage();
    await upload(storage, 10, 4);

    const create = storage.requests[0];
    assertEquals(create.method, "POST");
    assertEquals(create.url, ENDPOINT);
    assertEquals(create.headers.get("tus-resumable"), "1.0.0");
    assertEquals(create.headers.get("upload-length"), "10");
    assertEquals(create.headers.get("x-upsert"), "true");
    assertEquals(create.headers.get("authorization"), "Bearer service-key");
    assertEquals(
      create.headers.get("upload-metadata"),
      [
        `bucketName ${btoa("recordings")}`,
        `objectName ${btoa("tenant-1/meeting_bot/session-1.mp4")}`,
        `contentType ${btoa("video/mp4")}`,
      ].join(","),
    );
  });

  it("PATCHes fixed-size chunks at increasing offsets to the Location URL", async () => {
    const storage = fakeStorage();
    await upload(storage, 10, 4);

    const patches = storage.requests.slice(1);
    assertEquals(
      patches.map((p) => [p.headers.get("upload-offset"), p.bodyBytes]),
      [
        ["0", 4],
        ["4", 4],
        ["8", 2],
      ],
    );
    for (const patch of patches) {
      assertEquals(patch.method, "PATCH");
      assertEquals(
        patch.url,
        "https://db.test/storage/v1/upload/resumable/upload-1",
      );
      assertEquals(
        patch.headers.get("content-type"),
        "application/offset+octet-stream",
      );
      assertEquals(patch.headers.get("x-upsert"), "true");
    }
  });

  it("sends chunks of exactly 6MB by default", async () => {
    const storage = fakeStorage();
    const total = 2 * TUS_CHUNK_BYTES + 1000;
    await tusUpload({
      endpoint: ENDPOINT,
      serviceKey: "service-key",
      bucket: "recordings",
      objectName: "a.mp4",
      contentType: "video/mp4",
      body: byteStream(total, 1024 * 1024 + 7),
      length: total,
      fetchFn: storage.fetchFn,
    });

    assertEquals(
      storage.requests.slice(1).map((p) => p.bodyBytes),
      [TUS_CHUNK_BYTES, TUS_CHUNK_BYTES, 1000],
    );
  });

  it("throws when the create request fails", async () => {
    const storage = fakeStorage({ failCreate: true });
    await assertRejects(
      () => upload(storage, 10, 4),
      Error,
      "TUS create failed (404)",
    );
  });

  it("throws on a failed PATCH and sends no further chunks", async () => {
    const storage = fakeStorage({ failPatchAt: 1 });
    await assertRejects(
      () => upload(storage, 10, 4),
      Error,
      "TUS PATCH at offset 4 failed (413)",
    );
    assertEquals(storage.requests.length, 3);
  });

  it("throws when the server's offset disagrees with ours", async () => {
    const storage = fakeStorage({ wrongOffset: true });
    await assertRejects(
      () => upload(storage, 10, 4),
      Error,
      "server holds 3, expected 4",
    );
  });

  it("throws when the body is shorter than the declared length", async () => {
    const storage = fakeStorage();
    await assertRejects(
      () => upload(storage, 10, 4, 12),
      Error,
      "body ended at 10 of the declared 12 bytes",
    );
  });

  it("throws when the body is longer than the declared length", async () => {
    const storage = fakeStorage();
    await assertRejects(
      () => upload(storage, 10, 4, 6),
      Error,
      "longer than the declared 6 bytes",
    );
  });
});

describe("fixedSizeChunks", () => {
  it("regroups uneven pieces and keeps their bytes in order", async () => {
    const stream = ReadableStream.from([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4]),
      new Uint8Array([5, 6, 7, 8, 9]),
    ]);
    const chunks: Array<Array<number>> = [];
    for await (const chunk of fixedSizeChunks(stream, 4)) {
      chunks.push([...chunk]);
    }
    assertEquals(chunks, [[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
  });
});
