import { describe, expect, it } from "vitest";

import { manusWebhookSecretToSave } from "./manusWebhookSecret";

describe("manusWebhookSecretToSave", () => {
  it("saves an empty secret so the first Manus webhook sets it", () => {
    expect(manusWebhookSecretToSave("")).toBe("");
    expect(manusWebhookSecretToSave("   ")).toBe("");
  });

  it("keeps a secret copied from Manus, trimmed", () => {
    expect(manusWebhookSecretToSave(" huHGEz-from-manus ")).toBe(
      "huHGEz-from-manus",
    );
  });
});
