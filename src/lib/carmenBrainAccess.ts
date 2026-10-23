/**
 * Carmen's per-user brain permission rules. One source shared with the edge
 * functions, so the UI and the server agree on who may use which brain.
 */
export * from "../../supabase/functions/_shared/carmen/brain-access";
