import { describe, expect, it } from "vitest";
import { CAPTURE_GRANT, GRANTABLE_SITES } from "../src/device/siteGrant.ts";
import { BACKGROUND_WORKER, extensionManifest } from "./manifest.ts";

const ENVIRONMENTS = [
  {
    name: "production",
    supabaseUrl: "https://api.aios.co.il",
    supabaseOrigins: ["https://api.aios.co.il", "https://project.supabase.co"],
    publishableKey: "key",
    appOrigin: "https://aios.co.il",
  },
  {
    name: "staging",
    supabaseUrl: "https://staging.supabase.co",
    supabaseOrigins: ["https://staging.supabase.co"],
    publishableKey: "key",
    appOrigin: "https://staging.aios.co.il",
  },
] as const;

describe("extensionManifest", () => {
  for (const environment of ENVIRONMENTS) {
    describe(environment.name, () => {
      const manifest = extensionManifest({
        ...environment,
        supabaseOrigins: [...environment.supabaseOrigins],
      });

      it("adds scripting, identity for Google sign-in, and nothing broader than the plan allows", () => {
        expect(manifest.permissions).toEqual([
          "storage",
          "sidePanel",
          "scripting",
          "identity",
        ]);
        expect(manifest.optional_permissions).toEqual(["tabs"]);
      });

      it("grants no site at install: https sites are optional, asked one at a time, and all sites only for a screenshot", () => {
        expect(manifest.optional_host_permissions).toEqual([
          GRANTABLE_SITES,
          CAPTURE_GRANT,
        ]);
        expect(manifest.host_permissions).toEqual(
          [...environment.supabaseOrigins, environment.appOrigin].map(
            (origin) => `${origin}/*`,
          ),
        );
      });

      it("registers no content script, and the worker that runs Google sign-in", () => {
        expect(manifest.content_scripts).toBeUndefined();
        expect(manifest.background).toEqual({
          service_worker: BACKGROUND_WORKER,
          type: "module",
        });
      });
    });
  }
});
