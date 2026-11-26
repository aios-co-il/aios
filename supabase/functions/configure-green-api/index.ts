import { configureGreenApi } from "./configure.ts";

Deno.serve((req) => configureGreenApi(req));
