import { beforeEach, describe, expect, test, vi } from "vitest";

const { getUser, insert, from } = vi.hoisted(() => {
  const insert = vi.fn();
  return {
    getUser: vi.fn(),
    insert,
    from: vi.fn(() => ({ insert })),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser }, from },
}));

import { logSystemSendClientUpdate } from "./logSystemSendClientUpdate";

const ENTRY = {
  tenantId: "tenant-1",
  clientId: "client-1",
  content: "דוח שבועי נשלח",
  updateType: "weekly_update",
};

describe("logSystemSendClientUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("writes a system_send row for the signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    const error = await logSystemSendClientUpdate({
      ...ENTRY,
      metadata: { channels: ["email"] },
    });

    expect(error).toBeNull();
    expect(from).toHaveBeenCalledWith("client_updates");
    expect(insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      client_id: "client-1",
      user_id: "user-1",
      content: "דוח שבועי נשלח",
      update_type: "weekly_update",
      source: "system_send",
      metadata: { channels: ["email"] },
    });
  });

  test("returns the insert error so the caller can log it", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const failure = { message: "denied" };
    insert.mockResolvedValue({ error: failure });

    expect(await logSystemSendClientUpdate(ENTRY)).toBe(failure);
  });

  test("skips the write when nobody is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect(await logSystemSendClientUpdate(ENTRY)).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });
});
