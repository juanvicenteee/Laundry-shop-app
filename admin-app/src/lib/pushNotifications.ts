import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export async function registerForPushNotifications(profileId: string) {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn("No EAS projectId configured yet - run `eas init` in admin-app before push tokens can be issued.");
    return;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase
      .from("push_tokens")
      .upsert(
        { profile_id: profileId, expo_push_token: tokenResponse.data, updated_at: new Date().toISOString() },
        { onConflict: "expo_push_token" }
      );
  } catch (error) {
    console.warn("Could not register push token", error);
  }
}
