import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat, type Action } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError
} from "@supabase/supabase-js";

import { supabase } from "../../services/supabaseClient";
import type { NutritionAnalysisResult } from "./nutritionTypes";
import { validateImageUpload, validateNutritionAnalysisResponse } from "./nutritionAnalysisValidation";
export { MAX_ANALYSIS_IMAGE_BYTES, ALLOWED_ANALYSIS_MIME_TYPES, validateImageUpload, validateNutritionAnalysisResponse } from "./nutritionAnalysisValidation";

export interface NutritionImageAnalyzer {
  readonly id: string;
  analyze(input: { uri: string; mimeType: string }): Promise<NutritionAnalysisResult>;
}

type ErrorResponse = {
  status?: number;
  json?: () => Promise<unknown>;
};

export async function nutritionAnalysisErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as ErrorResponse | undefined;
    let serverMessage = "";
    try {
      const payload = await response?.json?.();
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const value = (payload as Record<string, unknown>).error;
        if (typeof value === "string") serverMessage = value.trim();
      }
    } catch {
      // Status-specific fallback below remains actionable if the body is malformed.
    }
    if (/development provider|not configured|configuration is incomplete/i.test(serverMessage)) {
      return "Photo analysis is not configured on the server yet.";
    }
    if (serverMessage) return serverMessage;
    if (response?.status === 401) return "Your session expired. Sign in again to analyze a meal photo.";
    if (response?.status === 404) return "The meal photo-analysis service has not been deployed.";
    if (response?.status === 413) return "The compressed meal photo is too large. Try another photo.";
    if (response?.status === 429) return "You have reached today’s photo-analysis limit.";
    return "The meal photo-analysis service could not process this image.";
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return "Could not reach the meal photo-analysis service. Check your connection and try again.";
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Meal analysis failed.";
}

export async function chooseAndCompressMealImage(source: "camera" | "library") {
  const permission = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(`${source === "camera" ? "Camera" : "Photo library"} permission is required.`);
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9, exif: false })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, exif: false, allowsMultipleSelection: false });
  if (result.canceled || !result.assets[0]) return null;
  const actions: Action[] = [];
  if (Number(result.assets[0].width) > 1280) actions.push({ resize: { width: 1280 } });
  const compressed = await manipulateAsync(
    result.assets[0].uri,
    actions,
    { compress: 0.7, format: SaveFormat.JPEG }
  );
  const info = await FileSystem.getInfoAsync(compressed.uri);
  const size = info.exists && "size" in info ? Number(info.size) : 0;
  validateImageUpload(size, "image/jpeg");
  return { uri: compressed.uri, mimeType: "image/jpeg", size };
}

export class SupabaseNutritionImageAnalyzer implements NutritionImageAnalyzer {
  readonly id = "supabase-edge";
  async analyze(input: { uri: string; mimeType: string }): Promise<NutritionAnalysisResult> {
    if (!supabase) throw new Error("Photo analysis is unavailable in this build. Manual logging still works offline.");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      throw new Error("Sign in before analyzing a meal photo.");
    }
    const info = await FileSystem.getInfoAsync(input.uri);
    validateImageUpload(info.exists && "size" in info ? Number(info.size) : 0, input.mimeType);
    const imageBase64 = await FileSystem.readAsStringAsync(input.uri, { encoding: FileSystem.EncodingType.Base64 });
    const { data, error } = await supabase.functions.invoke("analyze-nutrition-image", {
      body: { imageBase64, mimeType: input.mimeType }
    });
    if (error) throw new Error(await nutritionAnalysisErrorMessage(error));
    return validateNutritionAnalysisResponse(data);
  }
}

export class DevelopmentNutritionImageAnalyzer implements NutritionImageAnalyzer {
  readonly id = "development-unconfigured";
  async analyze(): Promise<NutritionAnalysisResult> {
    throw new Error("No image-analysis provider is configured. Use manual entry or configure the Supabase Edge Function.");
  }
}
