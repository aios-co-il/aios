import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAppColorMode, useApplyAppColorMode } from "./appColorMode";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("app color mode", () => {
  it("starts light and puts dark on <html> once switched", () => {
    const { result } = renderHook(() => {
      useApplyAppColorMode();
      return useAppColorMode();
    });
    expect(result.current.mode).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => result.current.toggle());

    expect(result.current.mode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("aios-app-color-mode")).toBe("dark");
  });

  it("takes dark off <html> when the app layout unmounts", () => {
    localStorage.setItem("aios-app-color-mode", "dark");
    const { unmount } = renderHook(() => useApplyAppColorMode());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
