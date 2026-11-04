import {
  assertEquals,
  assertExists,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
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
const response = (body: Uint8Array, length = body.length) => [
  encode(
    `HTTP/1.1 200 OK\r\nContent-Type: image/webp\r\nContent-Length: ${length}\r\nConnection: close\r\n\r\n`,
  ),
  body,
];

/** The parsed response; a test fails here when the bytes are not one. */
function parsed(raw: Uint8Array) {
  const response = parseHttpResponse(raw);
  assertExists(response);
  return response;
}

Deno.test(
  "a server that closes without TLS close_notify still delivers the whole picture",
  async () => {
    const { raw, capped } = await readUntilClosed(
      connection(response(portrait), noCloseNotify),
      1_000_000,
    );
    const picture = parsed(raw);
    assertStrictEquals(picture.status, 200);
    assertEquals(picture.body, portrait);
    assertStrictEquals(
      bodyProblem(picture, { maxBytes: 1_000_000, capped }),
      null,
    );
  },
);

Deno.test(
  "a body cut short before the missing close_notify is still reported as cut",
  async () => {
    const { raw, capped } = await readUntilClosed(
      connection(response(portrait, portrait.length + 50), noCloseNotify),
      1_000_000,
    );
    assertStrictEquals(
      bodyProblem(parsed(raw), { maxBytes: 1_000_000, capped }),
      "ההורדה נקטעה באמצע",
    );
  },
);

Deno.test("any other read failure is still an error", async () => {
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
