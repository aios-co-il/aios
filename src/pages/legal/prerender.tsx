import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import DataDeletion from "@/pages/DataDeletion";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import type { LegalPage } from "./legalPages";

const PAGE_COMPONENTS: Record<LegalPage["path"], () => JSX.Element> = {
  "/privacy": Privacy,
  "/terms": Terms,
  "/data-deletion": DataDeletion,
};

/** Renders a legal page to HTML for crawlers that do not run JavaScript. */
export function renderLegalPage(path: LegalPage["path"]): string {
  const Page = PAGE_COMPONENTS[path];
  return renderToString(
    <StaticRouter location={path}>
      <Page />
    </StaticRouter>,
  );
}
