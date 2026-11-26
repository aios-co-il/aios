import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { MiniMe } from "@/components/carmen/MiniMe/MiniMe";

const currentUser = vi.hoisted(() => ({ userId: "me" as string | undefined }));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: currentUser.userId, isLoading: false }),
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

/** The sign-in page's URL, as the guard sent the visitor there. */
function AuthLocation() {
  const location = useLocation();

  return <p>{`${location.pathname}${location.search}`}</p>;
}

describe("ProtectedRoute", () => {
  afterEach(() => {
    currentUser.userId = "me";
  });

  it("sends a signed-out visitor to sign in carrying the requested page", async () => {
    currentUser.userId = undefined;

    render(
      <MemoryRouter initialEntries={["/t/acme/card-drafts?tab=1"]}>
        <Routes>
          <Route path="/auth" element={<AuthLocation />} />
          <Route
            path="/t/:tenantSlug/card-drafts"
            element={
              <ProtectedRoute>
                <p>Card drafts</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        `/auth?next=${encodeURIComponent("/t/acme/card-drafts?tab=1")}`,
      ),
    ).toBeInTheDocument();
  });

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
