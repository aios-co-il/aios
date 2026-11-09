export type SearchConversationHistoryArgs = {
  query?: string;
  days_back?: number;
  only_carmen_chats?: boolean;
  with_phone?: string;
  browse_all_chats?: boolean;
  limit?: number;
};
