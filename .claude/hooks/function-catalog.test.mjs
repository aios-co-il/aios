import { describe, expect, it } from "vitest";
import { catalogFromSql } from "./function-catalog.mjs";

describe("catalogFromSql", () => {
  it("reads volatility before or after the body", () => {
    const catalog = catalogFromSql([
      "create or replace function public.a() returns int language sql stable as $$ select 1 $$;",
      "CREATE FUNCTION b() RETURNS int AS $body$ select 1 $body$ LANGUAGE sql IMMUTABLE;",
      "create function c() returns void language plpgsql as $$ begin insert into t values (1); end $$;",
    ]);

    expect(catalog.get("a")).toEqual({ readOnly: true, sends: false });
    expect(catalog.get("b")).toEqual({ readOnly: true, sends: false });
    expect(catalog.get("c")).toEqual({ readOnly: false, sends: false });
  });

  it("keeps a function writable when any definition is volatile", () => {
    const catalog = catalogFromSql([
      "create function a() returns int language plpgsql as $$ begin return 1; end $$;",
      "create or replace function a() returns int language sql stable as $$ select 1 $$;",
    ]);

    expect(catalog.get("a")?.readOnly).toBe(false);
  });

  it("spreads sending and writing through calls to other repo functions", () => {
    const catalog = catalogFromSql([
      "create function notify_it() returns void language plpgsql as $$ begin perform net.http_post(url := 'x'); end $$;",
      "create function wrapper() returns void language plpgsql stable as $$ begin perform notify_it(); end $$;",
      "create function outer_one() returns void language sql stable as $$ select wrapper() $$;",
    ]);

    expect(catalog.get("wrapper")).toEqual({ readOnly: false, sends: true });
    expect(catalog.get("outer_one")).toEqual({ readOnly: false, sends: true });
  });

  it("does not count reads of cron or net tables as sends", () => {
    const catalog = catalogFromSql([
      "create function jobs() returns setof record language sql stable as $$ select * from cron.job union select * from net._http_response $$;",
    ]);

    expect(catalog.get("jobs")).toEqual({ readOnly: true, sends: false });
  });
});
