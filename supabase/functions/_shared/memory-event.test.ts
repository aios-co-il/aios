import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  clientMemorySchema,
  campaignerMemorySchema,
  taskMemorySchema,
  chatMemorySchema,
  conversationMemorySchema,
} from "./memory-event.ts";
Deno.test("memory events require a string identifier for every entity", () => {
  for (const schema of [
    clientMemorySchema,
    campaignerMemorySchema,
    taskMemorySchema,
    chatMemorySchema,
    conversationMemorySchema,
  ]) {
    assertThrows(() => schema.parse({ id: {} }));
  }
});
Deno.test(
  "conversation events reject object content without losing valid messages",
  () => {
    const c = conversationMemorySchema.parse({
      id: "c",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: { bad: true } },
      ],
    });
    assertEquals(
      c.messages.map((m) => m.content),
      ["hello"],
    );
  },
);
