---
paths:
  - "src/**"
---

# Frontend

- **A page or component you add or grow past `max-lines` becomes a folder**: `src/components/<PageName>/` with one file per section, `use…` hooks and pure helpers in their own files; the page file only composes them. Repeated JSX becomes a shared component; stateful logic becomes a custom hook.
- **Server state goes through React Query**: `useQuery` for reads (`queryFn: id ? () => … : skipToken`), `useMutation` for writes with `mutate` and callbacks. Query keys share the entity prefix that mutations invalidate.
- **Use the project's stack**: `supabase.functions.invoke` for edge calls, Tailwind for styling, Zod at the boundary for untyped external payloads.
- **Reuse the date formatters in `src/lib`.**
