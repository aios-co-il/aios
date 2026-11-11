import { describe, it, expect, vi } from "vitest";
import { dataOrEmpty } from "./taskQueryResult";
describe("task query failures", () => {
  it("tolerates only explicit permission denials for optional cron", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        await dataOrEmpty(
          Promise.resolve({
            data: null,
            error: { code: "P0001", message: "permission denied" },
          }),
          true,
        ),
      ).toEqual([]);
      expect(
        await dataOrEmpty(
          Promise.resolve({ data: null, error: { code: "42501" } }),
          true,
        ),
      ).toEqual([]);
      for (const error of [
        { code: "42P01", message: "missing table" },
        new Error("network"),
        { code: "P0001", message: "other" },
      ]) {
        await expect(
          dataOrEmpty(Promise.resolve({ data: null, error }), true),
        ).rejects.toBe(error);
      }
      const error = { code: "42501" };
      await expect(
        dataOrEmpty(Promise.resolve({ data: null, error })),
      ).rejects.toBe(error);
    } finally {
      warn.mockRestore();
    }
  });
});
