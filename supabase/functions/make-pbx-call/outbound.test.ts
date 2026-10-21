import assert from "node:assert/strict";
import test from "node:test";
import { buildOutboundRequest, resolveCaller } from "./outbound.ts";
import { isAllowedOutboundUrl } from "./url-guard.ts";

test("resolveCaller prefers the user's mapped extension", () => {
  const settings = {
    default_extension: "100",
    default_caller_number: "031111111",
    extensions: [{ user_id: "u1", extension: "205", caller_number: "" }],
  };
  assert.deepEqual(resolveCaller(settings, "u1"), {
    extension: "205",
    callerNumber: "031111111",
  });
  assert.deepEqual(resolveCaller(settings, "u2"), {
    extension: "100",
    callerNumber: "031111111",
  });
});

test("buildOutboundRequest sends JSON with custom field names", async () => {
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
  assert.equal(url, "https://pbx.example.com/dial");
  assert.equal(init.method, "POST");
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer abc");
  assert.deepEqual(JSON.parse(init.body as string), {
    src: "031111111",
    dst: "0501234567",
    ext: "205",
    call_id: "c-1",
  });
});

test("buildOutboundRequest supports GET query strings", () => {
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
  assert.equal(init.method, "GET");
  assert.equal(init.body, undefined);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("key"), "1");
  assert.equal(parsed.searchParams.get("destination"), "0501234567");
  assert.equal(parsed.searchParams.get("extension"), "205");
  assert.equal(parsed.searchParams.has("caller"), false);
});

test("buildOutboundRequest supports form bodies", () => {
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
  assert.equal(body.get("caller"), "031111111");
  assert.equal(body.has("extension"), false);
});

test("isAllowedOutboundUrl blocks internal targets", () => {
  assert.equal(isAllowedOutboundUrl("https://pbx.example.com/x"), true);
  assert.equal(isAllowedOutboundUrl("http://8.8.8.8/x"), true);
  assert.equal(isAllowedOutboundUrl("http://localhost/x"), false);
  assert.equal(isAllowedOutboundUrl("http://127.0.0.1/x"), false);
  assert.equal(isAllowedOutboundUrl("http://10.0.0.5/x"), false);
  assert.equal(isAllowedOutboundUrl("http://192.168.1.1/x"), false);
  assert.equal(isAllowedOutboundUrl("http://169.254.169.254/x"), false);
  assert.equal(isAllowedOutboundUrl("http://[::1]/x"), false);
  assert.equal(isAllowedOutboundUrl("ftp://pbx.example.com"), false);
  assert.equal(isAllowedOutboundUrl("not a url"), false);
});
