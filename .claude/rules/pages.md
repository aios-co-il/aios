---
paths:
  - "src/components/**"
  - "src/pages/**"
---

<!-- Keep in sync with .cursor/rules/pages.mdc: same rule, different frontmatter. -->

# Pages and components

- **Split a large page into its own folder**: `src/components/<PageName>/` with one file per section, and data hooks (`use…`) and pure helpers in their own files; the page file only composes them.
