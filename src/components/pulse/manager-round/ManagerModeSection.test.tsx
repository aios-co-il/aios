import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { briefTime } from "../../../../supabase/functions/_shared/manager-round/brief-schedule.ts";
import { ManagerModeSection } from "./ManagerModeSection";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: null }),
}));

/** Renders the section; returns its onChange spy. */
function renderSection(mode: "off" | "observe" | "david_only" | "team") {
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ManagerModeSection mode={mode} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

describe("ManagerModeSection", () => {
  it("offers the four modes and marks the current one", () => {
    renderSection("observe");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /צפייה/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows the brief's time from its schedule", () => {
    renderSection("observe");
    expect(
      screen.getByText(new RegExp(`סיכום בוקר ב־${briefTime()}`)),
    ).toBeInTheDocument();
  });

  it("reports the picked mode", async () => {
    const onChange = renderSection("observe");
    await userEvent.click(screen.getByRole("radio", { name: /צוות מלא/ }));
    expect(onChange).toHaveBeenCalledWith("team");
  });
});
