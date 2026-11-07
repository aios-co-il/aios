export type NavigateToApp = (
  userId: string,
  accessToken?: string,
) => Promise<boolean>;
