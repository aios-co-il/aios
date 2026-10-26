import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  bodyProblem,
  decodeChunked,
  isBlockedAddress,
  parseHttpResponse,
  parsePublicHttpUrl,
} from "./public-url.ts";

Deno.test("only public http(s) hosts on default ports are allowed", () => {
  assertStrictEquals(
    parsePublicHttpUrl("example.com/page")?.href,
    "https://example.com/page",
  );
  assertStrictEquals(
    parsePublicHttpUrl("http://example.com")?.protocol,
    "http:",
  );
  for (const bad of [
    "http://localhost/",
    "file:///etc/passwd",
    "ftp://example.com",
    "http://metadata.google.internal/",
    "https://user:pw@example.com/",
    "https://example.com:8443/",
    "http://intranet.local/",
    "javascript:alert(1)",
  ])
    assertStrictEquals(parsePublicHttpUrl(bad), null, bad);
});

Deno.test(
  "private, loopback, link-local and mapped addresses are blocked",
  () => {
    for (const ip of [
      "10.0.0.5",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.4.4",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      "not-an-ip",
    ])
      assertStrictEquals(isBlockedAddress(ip), true, ip);
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"])
      assertStrictEquals(isBlockedAddress(ip), false, ip);
  },
);

Deno.test("a chunked body is rebuilt, a plain body is passed through", () => {
  const enc = new TextEncoder();
  const chunked = enc.encode(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6;ext=1\r\n world\r\n0\r\n\r\n",
  );
  const parsed = parseHttpResponse(chunked);
  assertStrictEquals(parsed?.status, 200);
  assertStrictEquals(parsed?.headers.get("content-type"), "text/html");
  assertStrictEquals(new TextDecoder().decode(parsed?.body), "hello world");
  const plain = parseHttpResponse(
    enc.encode("HTTP/1.1 301 Moved\r\nLocation: /x\r\n\r\nbody"),
  );
  assertStrictEquals(plain?.status, 301);
  assertStrictEquals(plain?.headers.get("location"), "/x");
  assertStrictEquals(new TextDecoder().decode(plain?.body), "body");
  assertStrictEquals(parseHttpResponse(enc.encode("garbage")), null);
  assertStrictEquals(decodeChunked(enc.encode("zz\r\n")).length, 0);
});

Deno.test(
  "a cut-off, oversized or short body is refused instead of passed on",
  () => {
    const enc = new TextEncoder();
    const whole = parseHttpResponse(
      enc.encode("HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nbody"),
    )!;
    assertStrictEquals(
      bodyProblem(whole, { maxBytes: 10, capped: false }),
      null,
    );

    const short = parseHttpResponse(
      enc.encode("HTTP/1.1 200 OK\r\nContent-Length: 9\r\n\r\nbody"),
    )!;
    assertStrictEquals(
      bodyProblem(short, { maxBytes: 10, capped: false }),
      "ההורדה נקטעה באמצע",
    );

    const announcedBig = parseHttpResponse(
      enc.encode("HTTP/1.1 200 OK\r\nContent-Length: 999\r\n\r\nbody"),
    )!;
    assertStrictEquals(
      bodyProblem(announcedBig, { maxBytes: 10, capped: false }),
      "הקובץ גדול מדי",
    );
    assertStrictEquals(
      bodyProblem(whole, { maxBytes: 10, capped: true }),
      "הקובץ גדול מדי",
    );
    assertStrictEquals(
      bodyProblem(whole, { maxBytes: 3, capped: false }),
      "הקובץ גדול מדי",
    );

    const chunkedCut = parseHttpResponse(
      enc.encode(
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n9\r\nhel",
      ),
    )!;
    assertStrictEquals(chunkedCut.complete, false);
    assertStrictEquals(
      bodyProblem(chunkedCut, { maxBytes: 10, capped: false }),
      "ההורדה נקטעה באמצע",
    );
  },
);
