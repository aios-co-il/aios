---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.mjs"
---

# Tests

- **Tests sit beside their module**, are named after it (`foo.ts` → `foo.test.ts`), group cases with `describe`, and match a runner's discovery pattern (`vitest.config.ts` `include`, or the `deno test` path in `.github/workflows/ci-frontend.yml`).
- **Edge tests use `Deno.test`** with `jsr:@std/assert`.
- **Simulate user interactions with `@testing-library/user-event`.** Create a session with `userEvent.setup()` and await its interactions; use this instead of `fireEvent`.
- **Test the seam that broke.** A fix gets a test that fails on the old code at the integration point: handler, SQL function, trigger or grant. Inject dependencies so fakes fit, and cover the error paths the UI must handle.
- **React Query tests use `withTestQuery`** from `src/test/withTestQuery.tsx`. Components use `render(withTestQuery(<Component />))`; hooks use a small test component that calls the real hook and renders its result, wrapped the same way. Create the wrapped element once per test setup so rerenders reuse its cache. Reserve `createTestQueryHarness` for tests that need direct cache access while AIO-339 retires it.
