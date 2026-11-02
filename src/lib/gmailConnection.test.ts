import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGmailConnection } from "./gmailConnection";

const { rpc, from, maybeSingle } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, from },
}));

describe("fetchGmailConnection", () => {
  beforeEach(() => {
    rpc.mockReturnValue({ maybeSingle });
  });

  it("returns the connected address from get_user_gmail_connection, never reading gmail_tokens", async () => {
    maybeSingle.mockResolvedValue({
      data: { google_email: "owner@example.com" },
      error: null,
    });

    await expect(fetchGmailConnection()).resolves.toEqual({
      google_email: "owner@example.com",
    });
    expect(rpc).toHaveBeenCalledWith("get_user_gmail_connection");
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null when Gmail is not connected", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(fetchGmailConnection()).resolves.toBeNull();
  });

  it("throws the RPC error instead of reporting Gmail as not connected", async () => {
    const error = { message: "permission denied", code: "42501" };
    maybeSingle.mockResolvedValue({ data: null, error });

    await expect(fetchGmailConnection()).rejects.toBe(error);
  });
});
