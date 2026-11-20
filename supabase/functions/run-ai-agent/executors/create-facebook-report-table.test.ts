import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { AccessDeniedError } from "../../_shared/auth-helpers.ts";
import { executeCreateFacebookReportTable } from "./create-facebook-report-table.ts";
import {
  CAMPAIGNER_SCOPE,
  executorClient,
} from "./executor-client.test-fixture.ts";

describe("executeCreateFacebookReportTable", () => {
  it("refuses a campaigner not assigned to the client before any table work", async () => {
    const fixture = executorClient(
      (url) => {
        if (url.pathname.endsWith("/clients")) {
          return [{ agency_id: "a1" }];
        }
        return [];
      },
      200,
      CAMPAIGNER_SCOPE,
    );

    await assertRejects(
      () =>
        executeCreateFacebookReportTable(
          { client_id: "c9", ad_account_id: "act_1", ad_account_name: "Ads" },
          fixture.context,
        ),
      AccessDeniedError,
    );

    const tables = fixture.calls.filter((call) =>
      call.url.includes("/crm_tables"),
    );
    assertEquals(tables, []);
  });
});
