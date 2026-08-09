import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEVICE_ID_KEY = "anthra.friend-notifications.device-id.v1";
const CHANNEL_ID = "friend-activity";

function permissionGranted(permission: Notifications.NotificationPermissionsStatus): boolean {
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return created;
}

export async function registerFriendActivityPushToken(
  client: SupabaseClient,
  requestPermission: boolean
): Promise<boolean> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return false;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Friend activity",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 100, 180],
      lightColor: "#C8102E"
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permissionGranted(permission) && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permissionGranted(permission)) return false;

  const configuredProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const linkedProjectId = Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId;
  const projectId = configuredProjectId || linkedProjectId;
  if (!projectId) {
    throw new Error("Expo push notifications are not linked to an EAS project.");
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await client.rpc("register_device_push_token", {
    target_device_id: await deviceId(),
    target_expo_push_token: token.data,
    target_platform: Platform.OS
  });
  if (error) throw error;
  return true;
}

export async function unregisterFriendActivityPushToken(client: SupabaseClient): Promise<void> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!existing) return;
  const { error } = await client.rpc("unregister_device_push_token", {
    target_device_id: existing
  });
  if (error) throw error;
}
