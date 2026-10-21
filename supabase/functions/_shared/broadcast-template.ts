// Pure helpers shared by the broadcast edge functions, the automation engine
// and the frontend (template editor preview). No Deno / browser APIs here.
// Barrel: the implementations live in the modules below.
export * from "./template-vars.ts";
export * from "./email-html.ts";
export * from "./email-attachments.ts";
