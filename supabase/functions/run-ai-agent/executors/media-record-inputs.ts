export type SaveMediaFromChatArgs = {
  message_id?: string;
  media_url?: string;
  mime_type?: string;
  client_id?: string;
  lead_id?: string;
  caption?: string;
  tags?: Array<string>;
};

export type ListClientMediaArgs = {
  client_id?: string;
  lead_id?: string;
  only_ad_ready?: boolean;
  tags?: Array<string>;
  limit?: number;
};
