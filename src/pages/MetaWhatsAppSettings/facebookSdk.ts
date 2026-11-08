/** Load and initialize Meta's SDK, surfacing asynchronous setup errors to the caller. */
export function loadFacebookSdk(appId: string, version: string) {
  return new Promise<void>((resolve, reject) => {
    const win: FacebookWindow = window;
    const initialize = () => {
      // Meta invokes this after the Promise executor, so callback errors must reject it.
      try {
        const sdk = win.FB;
        if (!sdk) {
          throw new Error("Meta SDK לא נטען");
        }
        sdk.init({ appId, cookie: true, xfbml: false, version });
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    if (win.FB) {
      initialize();
      return;
    }
    win.fbAsyncInit = initialize;
    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("לא ניתן לטעון את Meta SDK"));
    document.body.appendChild(script);
  });
}

export type FacebookLoginResponse = {
  authResponse?: { code?: string; accessToken?: string };
};

export type FacebookSdk = {
  init: (options: {
    appId: string;
    cookie: boolean;
    xfbml: boolean;
    version: string;
  }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void;
};

export type FacebookWindow = Window & {
  FB?: FacebookSdk;
  fbAsyncInit?: () => void;
};
