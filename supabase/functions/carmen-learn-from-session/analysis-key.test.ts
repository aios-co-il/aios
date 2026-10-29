import { assertEquals } from "jsr:@std/assert@1";
import { analysisKey, type KeyLookup } from "./analysis-key.ts";

const lookup = (
  callerId: string | null,
  personal: string | null,
): KeyLookup => ({
  callerId: () => Promise.resolve(callerId),
  personalKey: () => Promise.resolve(personal),
});

Deno.test(
  "the owner's own conversation is analyzed with their personal key",
  async () => {
    // Before: only the project key was used, a placeholder on Staging, so learning failed.
    assertEquals(
      await analysisKey(
        "Bearer t",
        "u1",
        "placeholder",
        lookup("u1", "sk-user"),
      ),
      "sk-user",
    );
  },
);

Deno.test(
  "someone else's conversation never uses the caller's key",
  async () => {
    assertEquals(
      await analysisKey(
        "Bearer t",
        "u1",
        "sk-project",
        lookup("u2", "sk-user"),
      ),
      "sk-project",
    );
  },
);

Deno.test(
  "without a personal key or an owner, the project key is used",
  async () => {
    assertEquals(
      await analysisKey("Bearer t", "u1", "sk-project", lookup("u1", null)),
      "sk-project",
    );
    assertEquals(
      await analysisKey(
        "Bearer t",
        null,
        "sk-project",
        lookup("u1", "sk-user"),
      ),
      "sk-project",
    );
  },
);
