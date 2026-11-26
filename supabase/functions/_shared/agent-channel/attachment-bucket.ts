/**
 * The private bucket that holds the files a user attaches in the Command Center chat: each
 * user writes and reads only the folder named by their own user id (storage policies in
 * `20261009000100_catchup_shipped_schema.sql`). Pure, so the browser imports it too.
 */
export const COMMAND_CENTER_FILES_BUCKET = "command-center-files";
