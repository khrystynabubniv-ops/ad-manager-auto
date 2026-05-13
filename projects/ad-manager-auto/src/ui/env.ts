type ClientConfig = {
  API_BASE_URL?: string;
  AUTH_DISABLED?: string;
  OKTA_ISSUER?: string;
  OKTA_CLIENT_ID?: string;
  OKTA_REDIRECT_URI?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: ClientConfig;
  }
}

const viteEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;

export function getClientConfig(key: keyof ClientConfig): string {
  const runtimeValue = window.__APP_CONFIG__?.[key];
  if (runtimeValue !== undefined) {
    return runtimeValue;
  }

  return viteEnv[`VITE_${key}`] ?? "";
}
