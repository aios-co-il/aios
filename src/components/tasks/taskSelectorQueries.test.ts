import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchFirstTaskAgency,
  fetchTaskClients,
  fetchTaskLeads,
} from "./taskSelectorQueries";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  then: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue(query);
});

describe("task selector query boundaries", () => {
  it("rejects an explicit refetch without a tenant before contacting Supabase", async () => {
    for (const fetch of [
      () => fetchTaskClients(null, []),
      () => fetchTaskClients(null, ["shared-agency"]),
      () => fetchTaskLeads(undefined),
      () => fetchTaskLeads(null, ["shared-agency"], true),
      () => fetchFirstTaskAgency(null),
    ]) {
      await expect(fetch()).rejects.toThrow("tenant");
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("preserves cross-agency scope and the board lead limit", async () => {
    await fetchTaskClients("tenant", ["agency"]);
    expect(query.or).toHaveBeenCalledWith(
      "tenant_id.eq.tenant,agency_id.in.(agency)",
    );
    await fetchTaskLeads("tenant", [], true);
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant");
    expect(query.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(query.limit).toHaveBeenCalledWith(400);
  });

  it("rejects a failed detail lead selector instead of returning an empty list", async () => {
    const error = new Error("lead query denied");
    query.order.mockResolvedValueOnce({ data: null, error });

    await expect(fetchTaskLeads("tenant")).rejects.toBe(error);
    expect(from).toHaveBeenCalledWith("leads");
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant");
    expect(query.order).toHaveBeenCalledWith("company_name");
  });

  it("propagates selector errors and permits an absent fallback agency", async () => {
    query.order.mockResolvedValueOnce({
      data: null,
      error: new Error("denied"),
    });
    await expect(fetchTaskClients("tenant", [])).rejects.toThrow("denied");
    query.order.mockReturnThis();
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchFirstTaskAgency("tenant")).resolves.toBeNull();
    query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("denied"),
    });
    await expect(fetchFirstTaskAgency("tenant")).rejects.toThrow("denied");
  });
});
