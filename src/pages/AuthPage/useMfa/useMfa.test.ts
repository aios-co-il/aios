import { auth, session } from "../testUtils/authMocks";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useMfa } from "./useMfa";

describe("useMfa query freshness", () => {
  it("reads assurance again when the same user starts another completion attempt", async () => {
    const { wrapper } = createTestQueryHarness();
    const navigate = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useMfa(navigate), { wrapper });

    await act(async () => {
      await result.current.completeSignIn(
        session.user.id,
        session.access_token,
      );
    });

    auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await act(async () => {
      await result.current.completeSignIn(
        session.user.id,
        session.access_token,
      );
    });

    expect(auth.getAuthenticatorAssuranceLevel).toHaveBeenCalledTimes(2);
    expect(result.current.factorId).toBe("factor-id");
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
