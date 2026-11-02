---
paths:
  - "src/**"
---

<!-- Keep in sync with .cursor/rules/frontend.mdc: same rules, different frontmatter. -->

# Frontend page structure, React Query and stack conventions

- **Code lives beside its only caller.** A helper used by one page or component sits in that component's folder. Check importers of every new file in `src/lib/`: one importer means it moves.
- **A large page or component becomes a folder**: `src/components/<PageName>/` with one file per section, `use…` hooks and pure helpers in their own files; the page file only composes them. Repeated JSX becomes a shared component; stateful logic becomes a custom hook.
- **Server state goes through React Query**: `useQuery` for reads (`queryFn: id ? () => … : skipToken`), `useMutation` for writes with `mutate` and callbacks. Query keys share the entity prefix that mutations invalidate.
- **Use the project's stack**: `supabase.functions.invoke` for edge calls, Tailwind for styling, Zod at the boundary for untyped external payloads. Date formatters live in `src/lib`.
