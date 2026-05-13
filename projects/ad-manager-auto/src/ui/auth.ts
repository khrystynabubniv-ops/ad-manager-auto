import { OktaAuth } from "@okta/okta-auth-js";
import { getClientConfig } from "./env";

let oktaAuth: OktaAuth | undefined;

export function isAuthDisabled() {
  return getClientConfig("AUTH_DISABLED") === "true";
}

export function getOktaAuth() {
  if (isAuthDisabled()) {
    return undefined;
  }

  const issuer = getClientConfig("OKTA_ISSUER");
  const clientId = getClientConfig("OKTA_CLIENT_ID");
  const redirectUri = getClientConfig("OKTA_REDIRECT_URI") || `${window.location.origin}/login/callback`;

  if (!issuer || !clientId) {
    throw new Error("Okta is enabled but VITE_OKTA_ISSUER or VITE_OKTA_CLIENT_ID is missing");
  }

  oktaAuth ??= new OktaAuth({
    issuer,
    clientId,
    redirectUri,
    scopes: ["openid", "profile", "email"],
    pkce: true
  });

  return oktaAuth;
}

export async function getAccessToken(): Promise<string | undefined> {
  if (isAuthDisabled()) {
    return undefined;
  }

  const auth = getOktaAuth();
  return auth?.getAccessToken();
}
