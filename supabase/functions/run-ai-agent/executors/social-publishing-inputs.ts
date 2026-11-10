export type ListSocialPagesArgs = {
  platform?: "facebook" | "instagram";
  client_id?: string;
};

export type SyncSocialPagesArgs = { client_id?: string };

export type PublishSocialPostArgs = {
  page_id: string;
  post_type: "post" | "photo" | "video" | "reel" | "story" | "link";
  caption?: string;
  media_url?: string;
  link?: string;
  confirmed: boolean;
};

export type FetchSocialCommentsArgs = { page_id: string };

export type ListSocialCommentsArgs = {
  page_id?: string;
  client_id?: string;
  only_unreplied?: boolean;
};

export type HideSocialCommentArgs = {
  comment_row_id: string;
  confirmed: boolean;
};

export type CreateSocialPostArgs = {
  title: string;
  content: string;
  post_type?: "text" | "image" | "video" | "carousel";
  media_urls?: Array<string>;
};
