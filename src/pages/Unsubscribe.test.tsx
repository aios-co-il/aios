import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import Unsubscribe from "./Unsubscribe";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

const ID = "6f1c2b9e-3d4a-4e5f-8a7b-1c2d3e4f5a6b";

/** Render the page at /unsubscribe/pdpsagot with the given query. */
function renderAt(query: string) {
  return render(
    withTestQuery(
      <MemoryRouter initialEntries={[`/unsubscribe/pdpsagot${query}`]}>
        <Routes>
          <Route path="/unsubscribe/:tenantSlug" element={<Unsubscribe />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

/** A function error carrying the HTTP status, as supabase-js reports it. */
function httpError(status: number) {
  return new FunctionsHttpError(new Response("{}", { status }));
}

describe("Unsubscribe page", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("shows an invalid link without calling the server", () => {
    renderAt("?r=nope");
    expect(screen.getByText("קישור לא תקין")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("names the organization and unsubscribes only on the button", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, tenant_name: "פדפ שגות" },
      error: null,
    });
    const user = userEvent.setup();
    renderAt(`?r=${ID}`);

    expect(await screen.findByText("פדפ שגות")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      `broadcast-unsubscribe?r=${ID}&info=1`,
      { method: "GET" },
    );

    await user.click(screen.getByRole("button", { name: "הסירו אותי" }));

    expect(await screen.findByText("הוסרת בהצלחה ✓")).toBeInTheDocument();
    expect(screen.getByText("לא יישלחו אליך עוד דיוורים.")).toBeInTheDocument();
    expect(invoke).toHaveBeenLastCalledWith("broadcast-unsubscribe", {
      body: { r: ID },
    });
  });

  it("still works when the organization name lookup fails", async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: httpError(500) })
      .mockResolvedValueOnce({
        data: { ok: true, tenant_name: "פדפ שגות" },
        error: null,
      });
    const user = userEvent.setup();
    renderAt(`?r=${ID}`);

    await user.click(screen.getByRole("button", { name: "הסירו אותי" }));

    expect(await screen.findByText("הוסרת בהצלחה ✓")).toBeInTheDocument();
  });

  it("offers a retry after a server error", async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: httpError(500) })
      .mockResolvedValueOnce({ data: null, error: httpError(500) })
      .mockResolvedValueOnce({
        data: { ok: true, tenant_name: "פדפ שגות" },
        error: null,
      });
    const user = userEvent.setup();
    renderAt(`?r=${ID}`);

    await user.click(screen.getByRole("button", { name: "הסירו אותי" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(await screen.findByText("הוסרת בהצלחה ✓")).toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: httpError(404) })
      .mockResolvedValueOnce({ data: null, error: httpError(404) });
    const user = userEvent.setup();
    renderAt(`?r=${ID}`);

    await user.click(screen.getByRole("button", { name: "הסירו אותי" }));

    expect(await screen.findByText("הקישור פג או לא נמצא")).toBeInTheDocument();
  });
});
