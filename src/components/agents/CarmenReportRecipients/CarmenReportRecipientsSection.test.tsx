import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { CarmenReportRecipientsSection } from "./CarmenReportRecipientsSection";

type Row = {
  id: string;
  user_id: string | null;
  phone: string | null;
  label: string | null;
};

type StaffRow = {
  user_id: string;
  full_name: string;
  phone: string | null;
  is_owner: boolean;
};

const state = vi.hoisted(() => ({
  role: { isOwner: true, isAgencyOwner: false },
  rows: [] as Row[],
  staff: [] as StaffRow[],
  writeError: null as { message: string } | null,
  upserts: [] as Array<{ row: unknown; options: unknown }>,
  deletes: [] as Array<Array<[string, string]>>,
  rpc: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-a" }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => state.role,
}));
vi.mock("sonner", () => ({ toast: { error: state.toastError } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: state.rows, error: null }),
        }),
      }),
      upsert: async (row: unknown, options: unknown) => {
        state.upserts.push({ row, options });
        return { error: state.writeError };
      },
      delete: () => ({
        eq: (column: string, value: string) => ({
          eq: async (column2: string, value2: string) => {
            state.deletes.push([
              [column, value],
              [column2, value2],
            ]);
            return { error: null };
          },
        }),
      }),
    }),
    rpc: (...args: unknown[]) => {
      state.rpc(...args);
      return Promise.resolve({ data: state.staff, error: null });
    },
  },
}));

const FELIX: StaffRow = {
  user_id: "u-felix",
  full_name: "פליקס",
  phone: "0500000011",
  is_owner: true,
};

const NOPHONE: StaffRow = {
  user_id: "u-nophone",
  full_name: "בלי טלפון",
  phone: null,
  is_owner: false,
};

function mount() {
  const { wrapper } = withTestQuery();
  return render(<CarmenReportRecipientsSection />, { wrapper });
}

beforeEach(() => {
  state.role = { isOwner: true, isAgencyOwner: false };
  state.rows = [];
  state.staff = [FELIX, NOPHONE];
  state.writeError = null;
  state.upserts = [];
  state.deletes = [];
});

describe("CarmenReportRecipientsSection", () => {
  it("shows nothing and lists no staff for a member who is not an owner", () => {
    state.role = { isOwner: false, isAgencyOwner: false };

    const { container } = mount();

    expect(container).toBeEmptyDOMElement();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("is open to agency owners", async () => {
    state.role = { isOwner: false, isAgencyOwner: true };

    mount();

    expect(await screen.findByText("כרמן מדווחת ל")).toBeInTheDocument();
  });

  it("shows the owners Carmen falls back to when the list is empty", async () => {
    mount();

    expect(
      await screen.findByText(/כרמן מדווחת לבעלי הארגון: פליקס/),
    ).toBeInTheDocument();
  });

  it("lists configured recipients and warns about a member without a phone", async () => {
    state.rows = [
      { id: "r1", user_id: "u-felix", phone: null, label: null },
      { id: "r2", user_id: "u-nophone", phone: null, label: null },
      { id: "r3", user_id: null, phone: "+972500000099", label: "דוד" },
    ];

    mount();

    const list = await screen.findByRole("list", { name: "נמעני הדיווח" });
    const felix = within(list).getByText("פליקס").closest("li");
    const noPhone = within(list).getByText("בלי טלפון").closest("li");
    expect(felix).toHaveTextContent("0500000011");
    expect(noPhone).toHaveTextContent("אין טלפון בכרטיס");
    expect(within(list).getByText("דוד").closest("li")).toHaveTextContent(
      "+972500000099",
    );
  });

  it("warns only on the duplicate of two extra phones with one label", async () => {
    state.rows = [
      { id: "r1", user_id: "u-felix", phone: null, label: null },
      { id: "r2", user_id: null, phone: "+972500000011", label: "משרד" },
      { id: "r3", user_id: null, phone: "+972500000012", label: "משרד" },
    ];

    mount();

    const list = await screen.findByRole("list", { name: "נמעני הדיווח" });
    const [duplicate, other] = within(list)
      .getAllByText("משרד")
      .map((label) => label.closest("li"));
    expect(duplicate).toHaveTextContent("אותו טלפון כבר ברשימה");
    expect(other).not.toHaveTextContent("אותו טלפון כבר ברשימה");
  });

  it("adds a team member found by search", async () => {
    const user = userEvent.setup();
    mount();

    await user.type(await screen.findByLabelText("חיפוש חבר צוות"), "פליקס");
    expect(
      screen.queryByLabelText("הוסף את בלי טלפון"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("הוסף את פליקס"));

    await waitFor(() =>
      expect(state.upserts).toEqual([
        {
          row: { tenant_id: "tenant-a", user_id: "u-felix" },
          options: { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
        },
      ]),
    );
  });

  it("warns in the picker about a member without a phone", async () => {
    mount();

    const item = (await screen.findByLabelText("הוסף את בלי טלפון")).closest(
      "li",
    );
    expect(item).toHaveTextContent("אין טלפון בכרטיס");
  });

  it("adds an extra phone in E.164 with its label", async () => {
    const user = userEvent.setup();
    mount();

    await user.type(await screen.findByLabelText("שם למספר הנוסף"), "דוד");
    await user.type(
      screen.getByLabelText("מספר WhatsApp נוסף"),
      "050-000-0099",
    );
    await user.click(screen.getByRole("button", { name: "הוסף מספר" }));

    await waitFor(() =>
      expect(state.upserts).toEqual([
        {
          row: { tenant_id: "tenant-a", phone: "+972500000099", label: "דוד" },
          options: { onConflict: "tenant_id,phone", ignoreDuplicates: true },
        },
      ]),
    );
  });

  it("refuses an invalid extra phone without writing", async () => {
    const user = userEvent.setup();
    mount();

    await user.type(await screen.findByLabelText("שם למספר הנוסף"), "דוד");
    await user.type(screen.getByLabelText("מספר WhatsApp נוסף"), "123");
    await user.click(screen.getByRole("button", { name: "הוסף מספר" }));

    expect(screen.getByText("מספר WhatsApp לא תקין")).toBeInTheDocument();
    expect(state.upserts).toEqual([]);
  });

  it("explains when the database refuses a client's phone", async () => {
    const user = userEvent.setup();
    state.writeError = {
      message:
        "carmen_report_recipients: +972500000099 is a client phone of this organization",
    };
    mount();

    await user.type(await screen.findByLabelText("שם למספר הנוסף"), "לקוח");
    await user.type(screen.getByLabelText("מספר WhatsApp נוסף"), "0500000099");
    await user.click(screen.getByRole("button", { name: "הוסף מספר" }));

    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith(
        "המספר שייך ללקוח — כרמן לא מדווחת ללקוחות",
      ),
    );
  });

  it("removes a recipient of this organization only", async () => {
    const user = userEvent.setup();
    state.rows = [{ id: "r1", user_id: "u-felix", phone: null, label: null }];
    mount();

    await user.click(await screen.findByLabelText("הסר את פליקס"));

    await waitFor(() =>
      expect(state.deletes).toEqual([
        [
          ["id", "r1"],
          ["tenant_id", "tenant-a"],
        ],
      ]),
    );
  });
});
