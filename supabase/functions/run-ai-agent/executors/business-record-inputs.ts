export type ListCampaignersArgs = { limit?: number };

export type CreateCampaignerArgs = {
  full_name: string;
  phone?: string;
  email?: string;
  role?: Array<string>;
};

export type ListSalesPeopleArgs = { limit?: number };

export type CreateSalesPersonArgs = {
  full_name: string;
  phone?: string;
  email?: string;
};

export type ListAgenciesArgs = { limit?: number };

export type CreateAgencyArgs = {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
};

export type ListSuppliersArgs = { limit?: number };

export type CreateSupplierArgs = {
  name: string;
  type?: string;
  phone?: string;
  email?: string;
};

export type ListProductsArgs = { limit?: number };

export type CreateProductArgs = {
  name: string;
  description?: string;
  price: number;
};

export type ListUpdatesArgs = {
  entity_type: "client" | "lead";
  entity_id: string;
  limit?: number;
};
