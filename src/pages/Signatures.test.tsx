import { Component, type PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";
import { describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import Signatures from "./Signatures";

describe("signature document timestamps", () => {
  it.each([
    { timestamp: null, instant: 0 },
    { timestamp: "1970-01-01T00:00:00Z", instant: 0 },
    { timestamp: "2024-02-29T12:34:56Z", instant: "2024-02-29T12:34:56Z" },
    { timestamp: "2024-03-29T03:00:00+03:00", instant: "2024-03-29T00:00:00Z" },
    { timestamp: "0", instant: "2000-01-01T00:00:00" },
  ])(
    "preserves the document table display for $timestamp",
    ({ timestamp, instant }) => {
      render(
        withTestQuery(
          <MemoryRouter>
            <SeededPage timestamp={timestamp} />
          </MemoryRouter>,
        ),
      );

      expect(
        screen.getByRole("cell", {
          name: format(new Date(instant), "dd/MM/yyyy HH:mm"),
        }),
      ).toBeInTheDocument();
    },
  );

  it.each(["", "not-a-date"])(
    "preserves the existing formatting error for %j",
    (timestamp) => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        render(
          withTestQuery(
            <MemoryRouter>
              <FormattingErrorBoundary>
                <SeededPage timestamp={timestamp} />
              </FormattingErrorBoundary>
            </MemoryRouter>,
          ),
        );
        expect(screen.getByText("RangeError")).toBeInTheDocument();
        expect(errors).toHaveBeenCalled();
      } finally {
        errors.mockRestore();
      }
    },
  );
});

/** Seed the database row at the real document-list rendering seam. */
function SeededPage({
  timestamp,
}: {
  timestamp: Tables<"signature_documents">["created_at"];
}) {
  const client = useQueryClient();
  const document: Tables<"signature_documents"> = {
    id: "document-1",
    title: "Date display",
    created_at: timestamp,
    business_stamp_company_id: null,
    business_stamp_name: null,
    client_id: null,
    completed_at: null,
    content: null,
    created_by: "user-1",
    document_fields: [],
    document_type: "created",
    file_url: null,
    is_template: false,
    lead_id: null,
    saved_to_entity_at: null,
    signed_file_url: null,
    status: "draft",
    template_name: null,
    tenant_id: "tenant-1",
    updated_at: null,
  };
  client.setQueryData(["signature-documents", null], [document]);
  return <Signatures />;
}

class FormattingErrorBoundary extends Component<PropsWithChildren> {
  state = { errorName: "" };

  static getDerivedStateFromError(error: Error) {
    return { errorName: error.name };
  }

  render() {
    return this.state.errorName ? (
      <output>{this.state.errorName}</output>
    ) : (
      this.props.children
    );
  }
}

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: null, isActiveTenantDbSynced: true }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      throw new Error("Unexpected database request");
    }),
  },
}));
vi.mock("@/components/signatures/SignatureFieldPlacer", () => ({
  default: () => null,
  getRecipientColor: () => "",
}));
vi.mock("@/components/signatures/SignatureContactPicker", () => ({
  default: () => null,
}));
vi.mock("@/components/signatures/SendSignatureDialog", () => ({
  SendSignatureDialog: () => null,
}));
