import Constants from "expo-constants";

import { readAccessToken } from "../security/secureSession";

const configuredBaseUrl =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!configuredBaseUrl.startsWith("https://")) {
    throw new Error("API base URL must use HTTPS.");
  }

  const token = await readAccessToken();
  const response = await fetch(`${configuredBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}
