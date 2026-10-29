import { z } from "zod";

/** Strings and numbers as text; anything else reads as "". */
const tagName = z.union([z.string(), z.number().transform(String)]).catch("");

const manyChatTagSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: tagName,
});

export type ManyChatTag = z.infer<typeof manyChatTagSchema>;

const tagsBodySchema = z
  .object({ tags: z.array(z.unknown()).catch([]) })
  .catch({ tags: [] });

/** Tags from the get-manychat-tags response; entries without an id are dropped. */
export function parseManyChatTags(data: unknown): ManyChatTag[] {
  return tagsBodySchema.parse(data).tags.flatMap((tag) => {
    const parsed = manyChatTagSchema.safeParse(tag);
    return parsed.success ? [parsed.data] : [];
  });
}
