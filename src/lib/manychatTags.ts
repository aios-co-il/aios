export interface ManyChatTag {
  id: number | string;
  name: string;
}

/** Tags from the get-manychat-tags response; entries without an id are dropped. */
export function parseManyChatTags(data: unknown): ManyChatTag[] {
  if (typeof data !== "object" || data === null || !("tags" in data)) {
    return [];
  }
  const { tags } = data;
  if (!Array.isArray(tags)) return [];
  return tags.flatMap((tag: unknown) => {
    if (typeof tag !== "object" || tag === null || !("id" in tag)) return [];
    const { id } = tag;
    if (typeof id !== "number" && typeof id !== "string") return [];
    const name = "name" in tag && typeof tag.name === "string" ? tag.name : "";
    return [{ id, name }];
  });
}
