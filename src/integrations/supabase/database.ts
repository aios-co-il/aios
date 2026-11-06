type GeneratedDatabase = import("./types").Database;

type PublicSchema = GeneratedDatabase["public"];
type CreateClientWithAssignment =
  PublicSchema["Functions"]["create_client_with_assignment"];

// The generator omits RPC argument nullability, including these SQL DEFAULT NULL
// text parameters. Keep this correction outside both regenerated type mirrors.
type CreateClientWithAssignmentArgs = Omit<
  CreateClientWithAssignment["Args"],
  "p_phone" | "p_email" | "p_notes"
> & {
  p_phone?: string | null;
  p_email?: string | null;
  p_notes?: string | null;
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: Omit<
      PublicSchema["Functions"],
      "create_client_with_assignment"
    > & {
      create_client_with_assignment: Omit<
        CreateClientWithAssignment,
        "Args"
      > & {
        Args: CreateClientWithAssignmentArgs;
      };
    };
  };
};
