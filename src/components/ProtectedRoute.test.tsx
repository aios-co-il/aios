import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { MiniMe } from "@/components/carmen/MiniMe/MiniMe";

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "me", isLoading: false }),
}));
vi.mock("@/hooks/useUserPermissions", () => ({
  useUserPermissions: () => ({
    hasPermission: () => true,
    isLoading: false,
    isReady: true,
  }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isLoading: false, isReady: true }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("@/hooks/useMiniMeGender", () => ({
  useMiniMeGender: () => ({
    gender: "female",
    setGender: vi.fn(),
    saving: false,
  }),
}));

describe("ProtectedRoute", () => {
  it("gives a page outside the app layout the user's Mini Me set", () => {
    // The command center renders under ProtectedRoute without AppLayout (AIO-585).
    const { container } = render(
      <MemoryRouter initialEntries={["/t/acme/command-center"]}>
        <ProtectedRoute>
          <MiniMe />
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(
      container.querySelector(".mini-me")?.getAttribute("data-gender"),
    ).toBe("female");
  });
});
