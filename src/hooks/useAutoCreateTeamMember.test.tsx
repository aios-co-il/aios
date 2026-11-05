import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { useAutoCreateTeamMember } from "./useAutoCreateTeamMember";

const { from, success, errorToast } = vi.hoisted(() => ({
  from: vi.fn(),
  success: vi.fn(),
  errorToast: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("./useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("sonner", () => ({ toast: { success, error: errorToast } }));

type MemberKind = "campaigner" | "salesPerson";

/** Exercise the real mutation through a component with its own query cache. */
function CreateMember({ kind }: { kind: MemberKind }) {
  const { createCampaigner, createSalesPerson } = useAutoCreateTeamMember();
  const mutation = kind === "campaigner" ? createCampaigner : createSalesPerson;
  return (
    <button
      onClick={() => {
        const identity = {
          userId: "user-1",
          fullName: "Member",
          email: "member@example.com",
        };
        if (kind === "campaigner") {
          createCampaigner.mutate({ ...identity, agencyIds: ["agency-1"] });
        } else {
          createSalesPerson.mutate({ ...identity, agencyId: "agency-1" });
        }
      }}
    >
      {mutation.isSuccess ? JSON.stringify(mutation.data) : "create"}
    </button>
  );
}

/** Fluent fake keeps awaited query results and write arguments observable. */
function queryReply(data: unknown, error: Error | null = null) {
  const promise = Promise.resolve({ data, error });
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => promise),
    single: vi.fn(() => promise),
    then: promise.then.bind(promise),
  };
}

describe.each<MemberKind>(["campaigner", "salesPerson"])(
  "%s creation",
  (kind) => {
    const table = kind === "campaigner" ? "campaigners" : "sales_people";
    const profileKey =
      kind === "campaigner" ? "campaigner_id" : "sales_person_id";

    beforeEach(() => vi.resetAllMocks());

    it("creates and links a new member with a non-reused result", async () => {
      const insert = queryReply({ id: "new-member" });
      const profileWrite = queryReply(null);
      from
        .mockReturnValueOnce(queryReply(null))
        .mockReturnValueOnce(queryReply([]))
        .mockReturnValueOnce(insert);
      if (kind === "campaigner") from.mockReturnValueOnce(queryReply(null));
      from.mockReturnValueOnce(profileWrite);
      render(withTestQuery(<CreateMember kind={kind} />));
      fireEvent.click(screen.getByRole("button"));
      await screen.findByText('{"id":"new-member","reused":false}');
      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: "tenant-1", full_name: "Member" }),
      );
      expect(profileWrite.update).toHaveBeenCalledWith({
        [profileKey]: "new-member",
      });
      expect(errorToast).not.toHaveBeenCalled();
    });

    it("reuses the assigned member and fills its missing email", async () => {
      const emailWrite = queryReply(null);
      const profileWrite = queryReply(null);
      from
        .mockReturnValueOnce(queryReply({ [profileKey]: "existing-member" }))
        .mockReturnValueOnce(
          queryReply([{ id: "existing-member", email: null }]),
        )
        .mockReturnValueOnce(emailWrite);
      if (kind === "campaigner") from.mockReturnValueOnce(queryReply(null));
      from.mockReturnValueOnce(profileWrite);
      render(withTestQuery(<CreateMember kind={kind} />));
      fireEvent.click(screen.getByRole("button"));
      await screen.findByText('{"id":"existing-member","reused":true}');
      expect(from).toHaveBeenNthCalledWith(3, table);
      expect(emailWrite.update).toHaveBeenCalledWith({
        email: "member@example.com",
      });
      expect(profileWrite.update).toHaveBeenCalledWith({
        [profileKey]: "existing-member",
      });
    });

    it("reports a rejected email update before linking or claiming success", async () => {
      from
        .mockReturnValueOnce(queryReply({ [profileKey]: "existing-member" }))
        .mockReturnValueOnce(
          queryReply([{ id: "existing-member", email: null }]),
        )
        .mockReturnValueOnce(
          queryReply(null, new Error("email update rejected")),
        )
        .mockReturnValue(queryReply(null));
      render(withTestQuery(<CreateMember kind={kind} />));
      fireEvent.click(screen.getByRole("button"));
      await waitFor(() =>
        expect(errorToast).toHaveBeenCalledWith(
          expect.stringContaining("email update rejected"),
        ),
      );
      expect(from).toHaveBeenCalledTimes(3);
      expect(success).not.toHaveBeenCalled();
    });
  },
);
