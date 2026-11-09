import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListCampaigners } from "../../executors/list-campaigners.ts";
import { executeCreateCampaigner } from "../../executors/create-campaigner.ts";
import { executeListSalesPeople } from "../../executors/list-sales-people.ts";
import { executeCreateSalesPerson } from "../../executors/create-sales-person.ts";
import { executeListAgencies } from "../../executors/list-agencies.ts";
import { executeCreateAgency } from "../../executors/create-agency.ts";
import { executeListSuppliers } from "../../executors/list-suppliers.ts";
import { executeCreateSupplier } from "../../executors/create-supplier.ts";
import { executeListProducts } from "../../executors/list-products.ts";
import { executeCreateProduct } from "../../executors/create-product.ts";
import { executeListUpdates } from "../../executors/list-updates.ts";

/** business-record tool routes; argument assertions retain the legacy tool boundary. */
export const businessRecordRoutes: Record<string, ToolRoute> = {
  list_campaigners: bindToolRoute(executeListCampaigners),
  create_campaigner: bindToolRoute(executeCreateCampaigner),
  list_sales_people: bindToolRoute(executeListSalesPeople),
  create_sales_person: bindToolRoute(executeCreateSalesPerson),
  list_agencies: bindToolRoute(executeListAgencies),
  create_agency: bindToolRoute(executeCreateAgency),
  list_suppliers: bindToolRoute(executeListSuppliers),
  create_supplier: bindToolRoute(executeCreateSupplier),
  list_products: bindToolRoute(executeListProducts),
  create_product: bindToolRoute(executeCreateProduct),
  list_updates: bindToolRoute(executeListUpdates),
};
