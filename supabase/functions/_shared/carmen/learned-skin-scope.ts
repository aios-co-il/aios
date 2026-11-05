/**
 * Where a coding agent puts a skin every org's Carmen needs. The teaching
 * block of claude-mcp, cursor-mcp and grok-mcp appends it to the tenant-skin
 * instruction; `docs/agents/carmen.md` points here.
 */
export const GLOBAL_SKIN_RULE =
  "Conduct every org's Carmen needs goes in a scope='global' row (tenant_id NULL, naming no org's people, phones or clients) " +
  "that you add only as a migration in your PR, so it runs on Staging before Production.";
