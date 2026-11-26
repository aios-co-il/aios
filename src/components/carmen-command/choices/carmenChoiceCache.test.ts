import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  choiceCacheKey,
  readChoiceCache,
  writeChoiceCache,
} from "./carmenChoiceCache";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A browser that refuses storage access, as with blocked site data or a full quota. */
function blockStorage() {
  vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse });
}

/** Any storage call in that browser. */
function refuse(): never {
  throw new Error("storage is blocked");
}

describe("carmenChoiceCache", () => {
  it("reads back what it wrote for the same org and user", () => {
    writeChoiceCache("tenant-a", "user-1", {
      brainSlug: "gpt-fast",
      voice: null,
    });

    expect(readChoiceCache("tenant-a", "user-1")).toEqual({
      brainSlug: "gpt-fast",
      voice: null,
    });
  });

  it("keeps each org and each user apart", () => {
    writeChoiceCache("tenant-a", "user-1", { brainSlug: "a", voice: "marin" });

    expect(readChoiceCache("tenant-b", "user-1")).toBeNull();
    expect(readChoiceCache("tenant-a", "user-2")).toBeNull();
    expect(choiceCacheKey("tenant-a", "user-1")).toBe(
      "aios:carmen-choices:tenant-a:user-1",
    );
  });

  it("stores only the two picks", () => {
    const withExtra = { brainSlug: "a", voice: "marin", answered: true };

    writeChoiceCache("tenant-a", "user-1", withExtra);

    expect(localStorage.getItem(choiceCacheKey("tenant-a", "user-1"))).toBe(
      '{"brainSlug":"a","voice":"marin"}',
    );
  });

  it.each([
    ["text that is not JSON", "{oops"],
    ["a JSON value of another shape", '{"brainSlug":7,"voice":null}'],
    ["a missing column", '{"brainSlug":"a"}'],
    ["a bare string", '"gpt-fast"'],
  ])("reads %s as no cache", (_name, stored) => {
    localStorage.setItem(choiceCacheKey("tenant-a", "user-1"), stored);

    expect(readChoiceCache("tenant-a", "user-1")).toBeNull();
  });

  it("reads no cache when storage is unavailable", () => {
    blockStorage();

    expect(readChoiceCache("tenant-a", "user-1")).toBeNull();
  });

  it("logs and carries on when storage refuses the write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    blockStorage();

    writeChoiceCache("tenant-a", "user-1", { brainSlug: "a", voice: null });

    expect(warn).toHaveBeenCalledOnce();
  });
});
