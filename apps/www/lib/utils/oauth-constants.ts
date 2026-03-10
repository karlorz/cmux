/**
 * Session storage key for OAuth callback URL.
 * Used by connect-github handler to store the return URL before OAuth,
 * and by after-sign-in handler to read it after OAuth completes.
 */
export const OAUTH_CALLBACK_KEY = "oauth_callback_url";
