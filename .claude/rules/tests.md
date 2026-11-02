---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# Tests

- **Tests sit beside their module**, are named after it (`foo.ts` → `foo.test.ts`), group cases with `describe`, and match a runner's discovery pattern (`vitest.config.ts` `include`, or the `deno test` path in `.github/workflows/ci-frontend.yml`).
- **Edge tests use `Deno.test`** with `jsr:@std/assert`.
- **Test the seam that broke.** A fix gets a test that fails on the old code at the integration point: handler, SQL function, trigger or grant. Inject dependencies so fakes fit, and cover the error paths the UI must handle.
