import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { CommandCenterSidecarShell } from "./CommandCenterSidecarShell";

vi.mock("@/contexts/CommandCenterSidecarContext", () => ({
  useCommandCenterSidecar: () => ({ open: false, setOpen: vi.fn() }),
}));
vi.mock("./access", () => ({
  useCommandCenterAccess: () => ({ allowed: true, loading: false }),
}));
vi.mock("./CommandCenterSidecar", () => ({ CommandCenterSidecar: () => null }));

const layoutAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CommandCenterSidecarShell>
        <p>עמוד</p>
      </CommandCenterSidecarShell>
    </MemoryRouter>,
  ).container.querySelector(".carmen-session-layout")!;

test("only the workshop route gets the workshop layout", () => {
  expect(layoutAt("/t/acme/workshop")).toHaveClass("is-workshop");
  expect(layoutAt("/t/acme/workshop/")).toHaveClass("is-workshop");
  // A tenant whose slug says "workshop" keeps the normal layout on its other pages.
  expect(layoutAt("/t/workshop-studio/clients")).not.toHaveClass("is-workshop");
  expect(layoutAt("/t/acme/workshop-notes")).not.toHaveClass("is-workshop");
});
