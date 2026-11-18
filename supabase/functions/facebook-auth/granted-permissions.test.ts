import { assertEquals } from "jsr:@std/assert@1";
import { missingFacebookPermissions } from "./granted-permissions.ts";

Deno.test("a declined webhook permission is reported missing", () => {
  assertEquals(
    missingFacebookPermissions({
      data: [
        { permission: "pages_show_list", status: "granted" },
        { permission: "pages_manage_metadata", status: "declined" },
      ],
    }),
    ["pages_manage_metadata"],
  );
});

Deno.test("nothing is missing when both permissions are granted", () => {
  assertEquals(
    missingFacebookPermissions({
      data: [
        { permission: "pages_show_list", status: "granted" },
        { permission: "pages_manage_metadata", status: "granted" },
      ],
    }),
    [],
  );
});
