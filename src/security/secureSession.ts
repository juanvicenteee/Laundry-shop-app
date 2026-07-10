import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "laundrygo.accessToken";

export async function saveAccessToken(token: string) {
  if (!token || token.length < 24) {
    throw new Error("Refusing to store an invalid session token.");
  }

  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function readAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearAccessToken() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}
