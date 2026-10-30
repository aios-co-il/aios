import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { permissionHandleForPathname } from "@/lib/moduleRoutePermissions";
import Home from "./Home";

const state = vi.hoisted(() => ({
  granted: new Set<string>(),
  navigate: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => state.navigate }));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (route: string) => `/t/acme${route}` }),
}));
vi.mock("@/hooks/useUserPermissions", () => ({
  useUserPermissions: () => ({
    hasPermission: (permission: string) => state.granted.has(permission),
  }),
}));

beforeEach(() => {
  state.granted = new Set();
});

const WORKSHOP_TILE = "הסדנה של כרמן";

test("the workshop tile shows only to a user the workshop route lets in", () => {
  state.granted = new Set(["dashboard"]);
  const { unmount } = render(<Home />);
  expect(screen.queryByText(WORKSHOP_TILE)).toBeNull();
  unmount();

  state.granted = new Set(["social_media"]);
  render(<Home />);
  fireEvent.click(screen.getByText(WORKSHOP_TILE));
  expect(state.navigate).toHaveBeenCalledWith("/t/acme/workshop");
});

test("every tile a user sees opens a page the route guard lets them in", () => {
  for (const only of ["dashboard", "social_media", "clients", "leads"]) {
    state.granted = new Set([only]);
    const { container, unmount } = render(<Home />);
    for (const tile of within(container).queryAllByRole("button")) {
      state.navigate.mockClear();
      fireEvent.click(tile);
      const [path] = state.navigate.mock.calls[0] as [string];
      const needed = permissionHandleForPathname(path)?.permission;
      expect(
        needed === undefined || state.granted.has(needed),
        `${tile.textContent} → ${path} needs ${needed}`,
      ).toBe(true);
    }
    unmount();
  }
});
