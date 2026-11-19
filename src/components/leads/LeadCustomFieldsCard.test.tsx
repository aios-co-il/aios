import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LeadCustomFieldDefinition } from "@/lib/leadCustomFields";
import { LeadCustomFieldsCard } from "./LeadCustomFieldsCard";

function field(
  overrides: Partial<LeadCustomFieldDefinition>,
): LeadCustomFieldDefinition {
  return {
    id: "f1",
    field_key: "employees",
    field_label: "מספר עובדים",
    field_type: "number",
    is_required: false,
    is_visible: true,
    options: null,
    sort_order: 0,
    ...overrides,
  };
}

describe("LeadCustomFieldsCard", () => {
  it("shows a custom field value the edit dialog saved to form_data", () => {
    render(
      <LeadCustomFieldsCard
        fields={[
          field({}),
          field({
            id: "f2",
            field_key: "has_branch",
            field_label: "סניף",
            field_type: "checkbox",
          }),
        ]}
        formData={{ employees: 42, has_branch: true }}
      />,
    );

    expect(screen.getByText(":מספר עובדים")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("כן")).toBeInTheDocument();
  });

  it("marks an empty value instead of hiding the field", () => {
    render(<LeadCustomFieldsCard fields={[field({})]} formData={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders nothing when the tenant has no custom fields", () => {
    const { container } = render(
      <LeadCustomFieldsCard fields={[]} formData={{}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
