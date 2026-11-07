export type NavigateToApp = (
  userId: string,
  accessToken?: string,
) => Promise<boolean>;

export interface AuthDestination {
  userId: string;
  accessToken?: string;
}
