# Codebase discovery and Graphify

The central system graph is rebuilt in CI after merges to `main` by `.github/workflows/sync-system-graph.yml`. A local graph may also be available at `graphify-out/` with community structure and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- Use `rg` and focused file reads for routine questions, small fixes, and known code paths. Ordinary chat and shell commands do not require graph checks.
- For broad architecture or dependency analysis, optionally use the shared `aios-system-graph` MCP tools (`query_system_graph` and `graph_status`) when available. Check freshness when relying on graph results, and confirm relevant relationships in source before changing code.
- If a local graph exists and would help, use `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"`. The local wiki can help with broad navigation; reserve `GRAPH_REPORT.md` for broad reviews or insufficient query results.
- Graph tools are optional unless the user explicitly requests them. If tools or graph data are unavailable or stale, continue with direct searches; do not install, rebuild, or repair Graphify as a prerequisite to unrelated work.
- Local graph updates are opt-in. Run `graphify update .` only when graph maintenance is part of the requested task; routine edits do not require it. CI maintains the central graph.
- Reuse existing functionality and inspect affected dependencies before opening a PR, using source files or graph results as appropriate.
- Keep Graphify output, generated reports, summaries, reflections, and work-memory files out of commits. Keep changes to Carmen and other critical monolithic functions small and additive.
