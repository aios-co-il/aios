import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { buildOutboundRequest, resolveCaller } from "./outbound.ts";
import { isAllowedOutboundUrl } from "./url-guard.ts";

Deno.test("resolveCaller prefers the user's mapped extension", () => {
  const settings = {
    default_extension: "100",
    default_caller_number: "031111111",
    extensions: [{ user_id: "u1", extension: "205", caller_number: "" }],
  };
  assertEquals(resolveCaller(settings, "u1"), {
    extension: "205",
    callerNumber: "031111111",
  });
  assertEquals(resolveCaller(settings, "u2"), {
    extension: "100",
    callerNumber: "031111111",
  });
});

Deno.test(
  "buildOutboundRequest sends JSON with custom field names",
  async () => {
    const { url, init } = buildOutboundRequest(
      {
        outbound_url: "https://pbx.example.com/dial",
        param_caller: "src",
        param_destination: "dst",
        param_extension: "ext",
        outbound_auth_header: "Authorization",
        outbound_auth_value: "Bearer abc",
      },
      {
        callerNumber: "031111111",
        destinationNumber: "0501234567",
        extension: "205",
        callId: "c-1",
      },
    );
    assertStrictEquals(url, "https://pbx.example.com/dial");
    assertStrictEquals(init.method, "POST");
    const headers = init.headers as Record<string, string>;
    assertStrictEquals(headers.Authorization, "Bearer abc");
    assertEquals(JSON.parse(init.body as string), {
      src: "031111111",
      dst: "0501234567",
      ext: "205",
      call_id: "c-1",
    });
  },
);

Deno.test("buildOutboundRequest supports GET query strings", () => {
  const { url, init } = buildOutboundRequest(
    {
      outbound_url: "https://pbx.example.com/dial?key=1",
      outbound_method: "GET",
    },
    {
      callerNumber: null,
      destinationNumber: "0501234567",
      extension: "205",
      callId: "c-2",
    },
  );
  assertStrictEquals(init.method, "GET");
  assertStrictEquals(init.body, undefined);
  const parsed = new URL(url);
  assertStrictEquals(parsed.searchParams.get("key"), "1");
  assertStrictEquals(parsed.searchParams.get("destination"), "0501234567");
  assertStrictEquals(parsed.searchParams.get("extension"), "205");
  assertStrictEquals(parsed.searchParams.has("caller"), false);
});

Deno.test("buildOutboundRequest supports form bodies", () => {
  const { init } = buildOutboundRequest(
    { outbound_url: "https://pbx.example.com/dial", outbound_format: "form" },
    {
      callerNumber: "031111111",
      destinationNumber: "0501234567",
      extension: null,
      callId: "c-3",
    },
  );
  const body = new URLSearchParams(init.body as string);
  assertStrictEquals(body.get("caller"), "031111111");
  assertStrictEquals(body.has("extension"), false);
});

Deno.test("isAllowedOutboundUrl blocks internal targets", () => {
  assertStrictEquals(isAllowedOutboundUrl("https://pbx.example.com/x"), true);
  assertStrictEquals(isAllowedOutboundUrl("http://8.8.8.8/x"), true);
  assertStrictEquals(isAllowedOutboundUrl("http://localhost/x"), false);
  assertStrictEquals(isAllowedOutboundUrl("http://127.0.0.1/x"), false);
  assertStrictEquals(isAllowedOutboundUrl("http://10.0.0.5/x"), false);
  assertStrictEquals(isAllowedOutboundUrl("http://192.168.1.1/x"), false);
  assertStrictEquals(isAllowedOutboundUrl("http://169.254.169.254/x"), false);
  assertStrictEquals(isAllowedOutboundUrl("http://[::1]/x"), false);
  assertStrictEquals(isAllowedOutboundUrl("ftp://pbx.example.com"), false);
  assertStrictEquals(isAllowedOutboundUrl("not a url"), false);
});
