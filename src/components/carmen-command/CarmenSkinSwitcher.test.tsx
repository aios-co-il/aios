import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import {
  CARMEN_ROLES,
  activeRoleSlugs,
} from "../../../supabase/functions/_shared/carmen/skin-roles";
import { CARMEN_CHARACTER } from "@/lib/agentSeats";
import { getSkinPortrait } from "@/lib/carmenSkinPortraits";
import { getSessionSkin, setSessionSkin } from "@/lib/carmenSessionSkin";
import { CarmenSkinSwitcher } from "./CarmenSkinSwitcher";
import { CarmenSessionVideoCard } from "./CarmenSessionVideoCard";

const state = vi.hoisted(() => ({
  tenantId: "tenant-a",
  identity: {
    displayName: "כרמן",
    skinAvatars: {} as Record<string, { avatarPath: string }>,
  },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({
    buildPath: (path: string) => `/t/${state.tenantId}/${path}`,
    isReady: true,
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutateAsync: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    isLoading: false,
    isSuccess: true,
    data:
      queryKey[0] === "carmen-skins-agent"
        ? { id: "agent-a", metadata: {} }
        : queryKey[0] === "carmen-identity"
          ? state.identity
          : queryKey[0] === "carmen-skin-avatar"
            ? queryKey[2]
              ? "https://example.com/tenant-portrait.webp"
              : undefined
            : queryKey[0] === "carmen-skins-options"
              ? [
                  ...CARMEN_ROLES.map((role) => ({
                    slug: role.slug,
                    name: role.name,
                    description: null,
                  })),
                  { slug: "qa", name: "QA", description: null },
                  { slug: "legal", name: "משפטי", description: null },
                ]
              : undefined,
  }),
}));

beforeEach(() => {
  state.tenantId = "tenant-a";
  state.identity.skinAvatars = {};
  setSessionSkin("tenant-a", null);
  setSessionSkin("tenant-b", null);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => {};
});
const card = {
  ref: { current: null },
  style: {},
  handlers: {},
} as unknown as ComponentProps<typeof CarmenSessionVideoCard>["videoCard"];
function Session() {
  return (
    <>
      <CarmenSkinSwitcher />
      <CarmenSessionVideoCard videoCard={card} faceState="idle" />
    </>
  );
}

test("only the 11 main roles appear and every selection updates the real Zoom portrait", async () => {
  const user = userEvent.setup();
  const { container } = render(<Session />);
  for (const role of [...CARMEN_ROLES.slice(1), CARMEN_ROLES[0]]) {
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(11);
    expect(
      screen.queryByRole("option", { name: "QA" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "משפטי" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: role.name }));
    await waitFor(() =>
      expect(
        container.querySelector(".carmen-session-character"),
      ).toHaveAttribute("src", getSkinPortrait(role.slug) || CARMEN_CHARACTER),
    );
    expect(getSessionSkin("tenant-a")).toBe(role.slug);
    expect(getSessionSkin("tenant-b")).toBeNull();
  }
});

test("a tenant's custom skin portrait wins over the role default in the Zoom window", () => {
  state.identity.skinAvatars = {
    campaigner: {
      avatarPath: "tenant-a/agent-avatars/skins/campaigner/custom.webp",
    },
  };
  setSessionSkin("tenant-a", "campaigner");
  const { container } = render(<Session />);
  expect(container.querySelector(".carmen-session-character")).toHaveAttribute(
    "src",
    "https://example.com/tenant-portrait.webp",
  );
});

test("category grouping retains specialists while honoring disabled and pinned skins", () => {
  expect(activeRoleSlugs("web_builder")).toContain("qa");
  expect(activeRoleSlugs("copywriter")).toContain("content_writer");
  expect(activeRoleSlugs("seo")).toContain("geo");
  expect(activeRoleSlugs("analyst")).toContain("data");
  expect(activeRoleSlugs("web_builder", ["security"], ["qa"])).not.toContain(
    "security",
  );
  expect(activeRoleSlugs("web_builder", ["security"], ["qa"])).not.toContain(
    "qa",
  );
  expect(activeRoleSlugs("web_builder", ["web_builder"])).toEqual([]);
  expect(activeRoleSlugs("legal")).toEqual(["legal"]);
  expect(activeRoleSlugs("qa")).toEqual(["qa"]);
});
