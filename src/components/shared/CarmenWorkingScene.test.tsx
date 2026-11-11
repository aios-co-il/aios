import { render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CarmenWorkingScene } from "./CarmenWorkingScene";

const state = vi.hoisted(() => ({ style: "orbs" as "orbs" | "character" }));
vi.mock("@/hooks/useCarmenAvatarStyle", () => ({
  useKnownCarmenAvatarStyle: () => state.style,
}));

beforeEach(() => {
  state.style = "orbs";
});

describe("CarmenWorkingScene", () => {
  test("shows the orb at work for the orb style", () => {
    const { container } = render(<CarmenWorkingScene />);
    expect(
      container.querySelector('.orb-buddy[data-state="working"]'),
    ).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  test("shows the typing clip for the character style", () => {
    state.style = "character";
    const { container } = render(<CarmenWorkingScene />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(container.querySelector(".orb-buddy")).toBeNull();
  });
});
