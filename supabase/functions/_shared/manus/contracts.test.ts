import { assertEquals } from "jsr:@std/assert@1";
import {
  readManusSettings,
  mergeManusSettings,
  readGatewayResponse,
  readTaskResponse,
  readManusRpc,
  readNotifyRequest,
  readNotifyStep,
  thrownMessage,
  thrownName,
} from "./contracts.ts";
Deno.test("Manus settings expose only validated named fields", () => {
  assertEquals(
    readManusSettings({ api_key: 3, instance_id: "i", arbitrary: true }),
    { api_key: undefined, instance_id: "i" },
  );
  assertEquals(mergeManusSettings({ extra: [1] }, { webhook_id: "w" }), {
    extra: [1],
    webhook_id: "w",
  });
});
Deno.test("gateway fields reject invalid types independently", () => {
  assertEquals(
    readGatewayResponse({
      success: false,
      error: "timeout",
      messageId: { id: "x" },
    }),
    { success: false, error: "timeout", messageId: undefined },
  );
});
Deno.test(
  "task response accepts both envelopes and rejects object identifiers",
  () => {
    assertEquals(
      readTaskResponse({ data: { task_id: "t" } }).data?.task_id,
      "t",
    );
    assertEquals(readTaskResponse({ task_id: {} }).task_id, undefined);
  },
);
Deno.test("MCP arguments expose named string fields only", () => {
  const rpc = readManusRpc({
    id: 1,
    method: "tools/call",
    params: {
      name: "ask_manus",
      arguments: { request: "hello", context: { bad: true }, extra: "ignored" },
    },
  });
  assertEquals(rpc.params?.arguments, { request: "hello", context: undefined });
});
Deno.test("notification payloads reject malformed recipient selectors", () => {
  assertEquals(
    readNotifyRequest({ tenant_id: {}, message: "hello" }).success,
    false,
  );
  assertEquals(
    readNotifyStep({ integration_id: 42, green_api_integration_id: "i" }),
    { integration_id: undefined, green_api_integration_id: "i" },
  );
});
Deno.test("error fields must be strings", () => {
  assertEquals(thrownMessage(new Error("boom")), "boom");
  assertEquals(thrownMessage({ message: "pg" }), "pg");
  assertEquals(thrownName({ name: [] }), undefined);
});

Deno.test(
  "status patches cannot erase stored values when gateway fields are absent",
  () => {
    assertEquals(
      mergeManusSettings(
        { status: "connected", phone_number: "123" },
        { status: undefined, phone_number: undefined },
      ),
      { status: "connected", phone_number: "123" },
    );
  },
);

Deno.test(
  "explicit malformed chat destinations cannot select a default recipient",
  () => {
    for (const chat_id of [null, 42, {}, []]) {
      assertEquals(
        readNotifyRequest({ tenant_id: "t", message: "hello", chat_id })
          .success,
        false,
      );
    }
    assertEquals(
      readNotifyRequest({ tenant_id: "t", message: "hello" }).success,
      true,
    );
    assertEquals(
      readNotifyRequest({
        tenant_id: "t",
        message: "hello",
        chat_id: "123@c.us",
      }).success,
      true,
    );
  },
);

Deno.test(
  "unusable explicit destinations report chat_id rather than choosing a fallback",
  () => {
    for (const chat_id of ["", "   ", "not-a-phone", "120363000000@g.us"]) {
      const result = readNotifyRequest({
        tenant_id: "t",
        message: "hello",
        chat_id,
      });
      assertEquals(result.success, false);
      if (!result.success) {
        assertEquals(
          result.error.issues.map((issue) => issue.path),
          [["chat_id"]],
        );
      }
    }
    assertEquals(
      readNotifyRequest({
        tenant_id: "t",
        message: "hello",
        chat_id: " +972-50-123-4567@c.us ",
      }).success,
      true,
    );
  },
);
