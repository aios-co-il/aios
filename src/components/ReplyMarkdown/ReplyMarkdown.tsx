import { createContext, useContext, type ComponentProps } from "react";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  isAiosImageAddress,
  projectOriginOf,
  type AiosAddressConfig,
} from "./replyImageSource";

/**
 * Text a model wrote, rendered as Markdown. The one renderer for replies,
 * summaries and agent output (ESLint keeps `react-markdown` out of every
 * other file): links open in a new tab, and an image loads only from an
 * address AIOS itself serves. Any other image shows as a link the reader may
 * open, so a reply cannot make the browser call an outside address by itself.
 */
export function ReplyMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

/** True below a Markdown link, where a second link cannot be nested. */
const InsideLink = createContext(false);

/** A link never navigates away from the screen it was shown on. */
function ReplyLink(props: ComponentProps<"a"> & ExtraProps) {
  const { children, ...anchor } = domProps(props);

  return (
    <a {...anchor} target="_blank" rel="noopener noreferrer">
      <InsideLink.Provider value={true}>{children}</InsideLink.Provider>
    </a>
  );
}

/** The image itself from an AIOS address; from anywhere else, its address. */
function ReplyImage(props: ComponentProps<"img"> & ExtraProps) {
  const { src, alt, ...image } = domProps(props);
  const insideLink = useContext(InsideLink);

  if (!src) {
    return <>{alt}</>;
  }
  if (isAiosImageAddress(src, aiosAddressConfig())) {
    return <img {...image} src={src} alt={alt} />;
  }
  if (insideLink) {
    return <span className="break-all">{alt ? `${alt}: ${src}` : src}</span>;
  }

  return (
    <>
      {alt ? `${alt}: ` : null}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all"
      >
        {src}
      </a>
    </>
  );
}

/** The element's own props: react-markdown adds its syntax node, which is no DOM attribute. */
function domProps<Props extends ExtraProps>(props: Props): Omit<Props, "node"> {
  const own = { ...props };
  delete own.node;

  return own;
}

/** The addresses this build and this page are served with. */
function aiosAddressConfig(): AiosAddressConfig {
  const config: AiosAddressConfig = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    appOrigin: window.location.origin,
  };
  reportUnknownProjectOrigin(config);

  return config;
}

/**
 * Says once, loudly, that this build cannot tell its project's own address:
 * the pictures Carmen generates are stored there, and they would otherwise
 * turn into links with nothing to explain why.
 */
function reportUnknownProjectOrigin(config: AiosAddressConfig): void {
  if (projectOriginReported || projectOriginOf(config) !== null) {
    return;
  }

  projectOriginReported = true;
  console.error(
    "[ReplyMarkdown] This build cannot tell its Supabase project's own address: " +
      "VITE_SUPABASE_URL is a custom domain and VITE_SUPABASE_PUBLISHABLE_KEY is not a JWT that names the project. " +
      "Pictures stored on the project's supabase.co address (generated creatives, custom Carmen portraits) show as links, not images.",
  );
}

let projectOriginReported = false;

const REMARK_PLUGINS = [remarkGfm];
const COMPONENTS: Components = { a: ReplyLink, img: ReplyImage };
