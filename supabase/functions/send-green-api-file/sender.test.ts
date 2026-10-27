import { assertEquals } from "jsr:@std/assert@1";
import type {
  LineStore,
  SenderLine,
} from "../_shared/report-sender/line-access.ts";
import { resolveGreenFileLine } from "./sender.ts";

const TENANT = "tenant-a";

const line = (id: string, tenant_id: string): SenderLine => ({
  id,
  tenant_id,
  user_id: "owner",
  api_key: "token",
  settings: { instance_id: "1101" },
});

const lines: Record<string, SenderLine> = {
  own: line("own", TENANT),
  shared: line("shared", "tenant-b"),
  foreign: line("foreign", "tenant-c"),
  colleague: line("colleague", TENANT),
};

const store: LineStore = {
  findActiveLine: async (id, type) =>
    type === "green_api" ? (lines[id] ?? null) : null,
  tenantCanUse: async (tenantId, id) => tenantId === TENANT && id === "shared",
  isMember: async () => true,
  isSuperAdmin: async () => false,
};

/** The resolved line id, or the error. */
async function resolve(integrationId: string | null, legacy?: SenderLine) {
  const result = await resolveGreenFileLine({
    store,
    tenantId: TENANT,
    integrationId,
    legacyLine: async () => legacy ?? null,
  });
  return "error" in result ? result.error : result.line.id;
}

Deno.test("resolveGreenFileLine", async (t) => {
  await t.step("sends from a named own or shared line", async () => {
    assertEquals(await resolve("own"), "own");
    assertEquals(await resolve("colleague"), "colleague");
    assertEquals(await resolve("shared"), "shared");
  });

  await t.step(
    "refuses another tenant's line instead of swapping it",
    async () => {
      // The legacy line exists, and is still not used for a named choice.
      assertEquals(await resolve("foreign", lines.own), "sender_not_allowed");
      assertEquals(await resolve("missing", lines.own), "sender_not_allowed");
    },
  );

  await t.step("without a named line keeps the old pick", async () => {
    assertEquals(await resolve(null, lines.own), "own");
    assertEquals(await resolve(null), "not_configured");
    assertEquals(
      await resolve(null, { ...lines.own, api_key: null }),
      "not_configured",
    );
  });
});
