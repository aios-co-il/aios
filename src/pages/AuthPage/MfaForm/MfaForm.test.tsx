import { auth, session } from "../testUtils/authMocks";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness, withTestQuery } from "@/test/withTestQuery";
import { useMfa } from "../useMfa/useMfa";
import { MfaForm } from "./MfaForm";

describe("MfaForm unmount cleanup", () => {
  it("releases verification when the form unmounts without sign-out", async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    auth.verify.mockImplementation(async () => {
      await pending;
      return { error: null };
    });
    const navigate = vi.fn().mockResolvedValue(true);
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(() => useMfa(navigate), { wrapper });
    const form = render(
      withTestQuery(
        <MfaForm
          factorId="factor-id"
          navigateToApp={navigate}
          onVerificationStart={result.current.onVerificationStart}
          backToSignIn={result.current.backToSignIn}
        />,
      ),
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("קוד אימות"), "123456");
    await user.click(screen.getByRole("button", { name: "אמת" }));
    await waitFor(() => expect(auth.verify).toHaveBeenCalledTimes(1));
    form.unmount();
    await act(async () => {
      await result.current.completeSignIn(
        session.user.id,
        session.access_token,
      );
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish?.();
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(auth.toast).not.toHaveBeenCalled();
  });
});
