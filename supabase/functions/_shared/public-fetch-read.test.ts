import {
  assertEquals,
  assertExists,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readUntilClosed, type Readable } from "./public-fetch-read.ts";
import { bodyProblem, parseHttpResponse } from "./workshop/public-url.ts";

const encode = (text: string) => new TextEncoder().encode(text);

/** A connection that hands out `parts` and then ends the way `end` says. */
function connection(
  parts: Array<Uint8Array>,
  end: () => Promise<null>,
): Readable {
  let at = 0;
  return {
    read(buffer) {
      if (at >= parts.length) {
        return end();
      }
      const part = parts[at++];
      buffer.set(part);
      return Promise.resolve(part.length);
    },
  };
}

/** What Deno's TLS read throws when the server closes without close_notify (rustls). */
const noCloseNotify = () =>
  Promise.reject(
    new Deno.errors.UnexpectedEof(
      "peer closed connection without sending TLS close_notify: https://docs.rs/rustls/latest/rustls/manual/_03_howto/index.html#unexpected-eof",
    ),
  );

const portrait = encode("RIFF-webp-bytes");

/** A picture response; `length` null sends no Content-Length (a close-delimited body). */
const pictureReply = (
  body: Uint8Array,
  length: number | null = body.length,
) => [
  encode(
    `HTTP/1.1 200 OK\r\nContent-Type: image/webp\r\n${
      length === null ? "" : `Content-Length: ${length}\r\n`
    }Connection: close\r\n\r\n`,
  ),
  body,
];

/** The parsed response; a test fails here when the bytes are not one. */
function parsed(raw: Uint8Array) {
  const reply = parseHttpResponse(raw);
  assertExists(reply);
  return reply;
}

/** Reads `parts` to the end the way `end` closes, and says what bodyProblem makes of it. */
async function problemOf(parts: Array<Uint8Array>, end: () => Promise<null>) {
  const { raw, capped, cleanClose } = await readUntilClosed(
    connection(parts, end),
    1_000_000,
  );
  return bodyProblem(parsed(raw), { maxBytes: 1_000_000, capped, cleanClose });
}

describe("readUntilClosed", () => {
  it("delivers the whole picture when the server closes without TLS close_notify", async () => {
    const { raw, cleanClose } = await readUntilClosed(
      connection(pictureReply(portrait), noCloseNotify),
      1_000_000,
    );
    const picture = parsed(raw);
    assertStrictEquals(picture.status, 200);
    assertEquals(picture.body, portrait);
    assertStrictEquals(cleanClose, false);
    assertStrictEquals(
      await problemOf(pictureReply(portrait), noCloseNotify),
      null,
    );
  });

  it("still reports a body shorter than its Content-Length as cut", async () => {
    assertStrictEquals(
      await problemOf(
        pictureReply(portrait, portrait.length + 50),
        noCloseNotify,
      ),
      "ההורדה נקטעה באמצע",
    );
  });

  it("refuses an unframed body that ends without close_notify, accepts it on a clean close", async () => {
    assertStrictEquals(
      await problemOf(pictureReply(portrait, null), noCloseNotify),
      "ההורדה נקטעה באמצע",
    );
    assertStrictEquals(
      await problemOf(pictureReply(portrait, null), () =>
        Promise.resolve(null),
      ),
      null,
    );
  });

  it("throws any other read failure", async () => {
    await assertRejects(
      () =>
        readUntilClosed(
          connection([], () =>
            Promise.reject(new Deno.errors.ConnectionReset("reset")),
          ),
          1_000,
        ),
      Deno.errors.ConnectionReset,
    );
  });
});
