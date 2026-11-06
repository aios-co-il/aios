/** Throwaway probe: fails on purpose to confirm ci-gate turns red. Delete with its branch. */
Deno.test("ci-gate probe fails on purpose", () => {
  throw new Error("intentional failure to verify ci-gate");
});
