import { render, screen } from "@testing-library/react";
import { Target } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { PulseDashboardTabTrigger } from "./PulseDashboardTabTrigger";

/** The "בלי יעד" tab with the given count. */
function renderTab(count: number) {
  render(
    <Tabs value="no_target">
      <TabsList>
        <PulseDashboardTabTrigger
          value="no_target"
          icon={Target}
          label="בלי יעד"
          count={count}
        />
      </TabsList>
    </Tabs>,
  );
  return screen.getByRole("tab");
}

describe("PulseDashboardTabTrigger", () => {
  it("shows the count while it is above zero", () => {
    expect(renderTab(3)).toHaveTextContent("בלי יעד3");
  });

  it("shows no badge for zero", () => {
    expect(renderTab(0)).toHaveTextContent(/^בלי יעד$/);
  });
});
