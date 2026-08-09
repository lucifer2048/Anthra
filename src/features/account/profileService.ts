import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat, type Action } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AnthraCloudProfile = {
  displayName: string;
  handle: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  discoverable: boolean;
};

const PROFILE_AVATAR_BUCKET = "anthra-profile-avatars";
const PROFILE_AVATAR_DIMENSION = 512;
const PROFILE_AVATAR_MAX_BYTES = 1024 * 1024;

function fallbackName(user: User): string {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return user.email?.split("@")[0] ?? "Anthra user";
}

async function signedAvatarUrl(
  client: SupabaseClient,
  avatarPath: string | null
): Promise<string | null> {
  if (!avatarPath) return null;
  const { data, error } = await client.storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(avatarPath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function loadCloudProfile(
  client: SupabaseClient,
  user: User
): Promise<AnthraCloudProfile> {
  const { data, error } = await client
    .from("profiles")
    .select("display_name,handle,avatar_path,discoverable")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  const avatarPath = data?.avatar_path ? String(data.avatar_path) : null;
  return {
    displayName: String(data?.display_name || fallbackName(user)),
    handle: String(data?.handle || ""),
    avatarPath,
    avatarUrl: await signedAvatarUrl(client, avatarPath),
    discoverable: data?.discoverable !== false
  };
}

export async function saveCloudProfile(
  client: SupabaseClient,
  user: User,
  values: { displayName: string; handle: string; discoverable: boolean }
): Promise<AnthraCloudProfile> {
  const displayName = values.displayName.trim().slice(0, 80);
  const handle = values.handle.trim().toLowerCase();
  if (!displayName) throw new Error("Enter your name.");
  if (handle && !/^[a-z0-9_]{3,24}$/.test(handle)) {
    throw new Error("Username must be 3–24 lowercase letters, numbers, or underscores.");
  }
  const { error } = await client.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: displayName,
      handle: handle || null,
      discoverable: values.discoverable,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
  return loadCloudProfile(client, user);
}

export async function chooseAndUploadAvatar(
  client: SupabaseClient,
  user: User
): Promise<AnthraCloudProfile | null> {
  if (Platform.OS === "ios") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Photo access is required to choose a profile picture.");
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: false,
    exif: false,
    base64: false,
    quality: 0.7
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (!asset.uri) throw new Error("The selected photo could not be opened.");
  const sourceWidth = Math.floor(Number(asset.width) || 0);
  const sourceHeight = Math.floor(Number(asset.height) || 0);
  const actions: Action[] = [];
  if (sourceWidth > 0 && sourceHeight > 0) {
    const squareSize = Math.min(sourceWidth, sourceHeight);
    actions.push({
      crop: {
        originX: Math.floor((sourceWidth - squareSize) / 2),
        originY: Math.floor((sourceHeight - squareSize) / 2),
        width: squareSize,
        height: squareSize
      }
    });
  }
  actions.push({ resize: { width: PROFILE_AVATAR_DIMENSION, height: PROFILE_AVATAR_DIMENSION } });
  const normalized = await manipulateAsync(
    asset.uri,
    actions,
    { compress: 0.68, format: SaveFormat.JPEG }
  );
  if (!normalized.uri) throw new Error("The selected photo could not be prepared.");
  const avatarPath = `${user.id}/avatar.jpg`;
  const bytes = await new File(normalized.uri).arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("The selected photo was empty.");
  if (bytes.byteLength > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("The profile picture could not be reduced below 1 MB. Please choose another photo.");
  }
  const { error: uploadError } = await client.storage.from(PROFILE_AVATAR_BUCKET).upload(avatarPath, bytes, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "60"
  });
  if (uploadError) throw uploadError;
  const current = await loadCloudProfile(client, user);
  const { error: profileError } = await client.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: current.displayName,
      handle: current.handle || null,
      avatar_path: avatarPath,
      discoverable: current.discoverable,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;
  return loadCloudProfile(client, user);
}
