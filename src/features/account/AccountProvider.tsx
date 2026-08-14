import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { AppState, Linking } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import type { Session, User } from "@supabase/supabase-js";

import { uploadAndVerifyLegacyData } from "./legacyImportService";
import {
  getAccountInstallationState,
  setAccountOnboardingState
} from "./accountRepository";
import type { AccountInstallationState, LegacyImportProgress } from "./accountTypes";
import {
  chooseAndUploadAvatar,
  loadCloudProfile,
  saveCloudProfile,
  type AnthraCloudProfile
} from "./profileService";
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigurationIssue
} from "../../services/supabaseClient";
import { loadSocialPrivacy, publishTodaySocialStats } from "../social/socialService";
import {
  registerFriendActivityPushToken,
  unregisterFriendActivityPushToken
} from "../social/friendActivityNotifications";
import { syncNutrition } from "../nutrition/nutritionSync";

WebBrowser.maybeCompleteAuthSession();

type AccountContextValue = {
  cloudAvailable: boolean;
  localDataReady: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
  installation: AccountInstallationState | null;
  onboardingLoading: boolean;
  legacyImportPrepared: boolean;
  legacyImportProgress: LegacyImportProgress | null;
  profile: AnthraCloudProfile | null;
  profileLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  requestEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  continueOffline: () => Promise<void>;
  retryLegacyImport: () => Promise<void>;
  saveProfile: (values: { displayName: string; handle: string; discoverable: boolean }) => Promise<void>;
  chooseProfilePhoto: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AccountContext = createContext<AccountContextValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function getRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: "anthra", path: "auth/callback" });
}

export function AccountProvider({
  children,
  localDataReady
}: {
  children: ReactNode;
  localDataReady: boolean;
}) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(supabaseConfigurationIssue);
  const [installation, setInstallation] = useState<AccountInstallationState | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [legacyImportPrepared, setLegacyImportPrepared] = useState(false);
  const [legacyImportProgress, setLegacyImportProgress] = useState<LegacyImportProgress | null>(null);
  const [profile, setProfile] = useState<AnthraCloudProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const handledAuthCodes = useRef(new Set<string>());

  const completeAuthUrl = useCallback(async (url: string) => {
    const client = supabase;
    if (!client || !url.startsWith("anthra://auth/callback")) return;
    const code = new URL(url).searchParams.get("code");
    if (!code || handledAuthCodes.current.has(code)) return;
    handledAuthCodes.current.add(code);
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      handledAuthCodes.current.delete(code);
      throw exchangeError;
    }
  }, []);

  const refreshInstallation = useCallback(async () => {
    const next = await getAccountInstallationState();
    setInstallation(next);
    return next;
  }, []);

  useEffect(() => {
    if (!localDataReady) return;
    let active = true;
    setOnboardingLoading(true);
    getAccountInstallationState()
      .then((next) => {
        if (active) setInstallation(next);
      })
      .catch((installationError: unknown) => {
        if (active) setError(errorMessage(installationError, "Could not determine Anthra onboarding state."));
      })
      .finally(() => {
        if (active) setOnboardingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [localDataReady]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    let active = true;
    client.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(sessionError.message);
        setSession(data.session);
        setLoading(false);
      })
      .catch((sessionError: unknown) => {
        if (!active) return;
        setError(errorMessage(sessionError, "Could not restore the Anthra session."));
        setLoading(false);
      });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    const appStateListener = AppState.addEventListener("change", (state) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    const linkListener = Linking.addEventListener("url", ({ url }) => {
      completeAuthUrl(url).catch((linkError: unknown) => {
        if (active) setError(errorMessage(linkError, "Could not complete Anthra sign-in."));
      });
    });
    Linking.getInitialURL()
      .then((url) => (url ? completeAuthUrl(url) : undefined))
      .catch((linkError: unknown) => {
        if (active) setError(errorMessage(linkError, "Could not complete Anthra sign-in."));
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      appStateListener.remove();
      linkListener.remove();
    };
  }, [completeAuthUrl]);

  useEffect(() => {
    if (!localDataReady || !session?.user.id || !installation) {
      setLegacyImportPrepared(false);
      setLegacyImportProgress(null);
      return;
    }
    if (
      installation.linkedAuthUserId &&
      installation.linkedAuthUserId !== session.user.id
    ) {
      setError("This device's Anthra data belongs to a different account. Sign in with the originally linked account.");
      supabase?.auth.signOut().catch(() => undefined);
      return;
    }
    let active = true;
    const client = supabase;
    if (!client) return;
    uploadAndVerifyLegacyData(client, session.user.id, (progress) => {
      if (active) setLegacyImportProgress(progress);
    })
      .then(() => {
        if (active) {
          setLegacyImportPrepared(true);
          refreshInstallation().catch(() => undefined);
        }
      })
      .catch((migrationError: unknown) => {
        if (active) {
          setError(errorMessage(migrationError, "Could not prepare existing Anthra data for sync."));
        }
      });
    return () => {
      active = false;
    };
  }, [installation?.linkedAuthUserId, localDataReady, refreshInstallation, session?.user.id]);

  useEffect(() => {
    const client = supabase;
    const user = session?.user;
    if (!client || !user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    loadCloudProfile(client, user)
      .then((next) => {
        if (active) setProfile(next);
      })
      .catch((profileError: unknown) => {
        if (active) setError(errorMessage(profileError, "Could not load your Anthra profile."));
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user]);

  useEffect(() => {
    const client = supabase;
    if (!client || !localDataReady || !session?.user.id || !legacyImportPrepared) return;
    const publish = () => publishTodaySocialStats(client).catch(() => undefined);
    publish();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") publish();
    });
    return () => listener.remove();
  }, [legacyImportPrepared, localDataReady, session?.user.id]);

  useEffect(() => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !userId) return;
    loadSocialPrivacy(client, userId)
      .then((privacy) => privacy.receiveActivityNotifications
        ? registerFriendActivityPushToken(client, false)
        : false)
      .catch(() => undefined);
  }, [session?.user.id]);

  useEffect(() => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !localDataReady || !userId || !legacyImportPrepared) return;
    let active = true;
    const sync = () => { if (active) syncNutrition(client, userId).catch(() => undefined); };
    sync();
    // Expo's current dependency set has no connectivity observer. Retrying while
    // active plus every foreground transition catches a restored connection
    // without making offline logging depend on network state.
    const interval = setInterval(sync, 60_000);
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") sync(); });
    return () => { active = false; clearInterval(interval); listener.remove(); };
  }, [legacyImportPrepared, localDataReady, session?.user.id]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error(supabaseConfigurationIssue ?? "Cloud features are unavailable.");
    setError(null);
    const redirectTo = getRedirectUri();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true }
    });
    if (oauthError) throw oauthError;
    if (!data.url) throw new Error("Google sign-in could not be started.");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return;
    await completeAuthUrl(result.url);
  }, [completeAuthUrl]);

  const requestEmailOtp = useCallback(async (email: string) => {
    if (!supabase) throw new Error(supabaseConfigurationIssue ?? "Cloud features are unavailable.");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Enter an email address.");
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true }
    });
    if (otpError) throw otpError;
  }, []);

  const verifyEmailOtp = useCallback(async (email: string, token: string) => {
    if (!supabase) throw new Error(supabaseConfigurationIssue ?? "Cloud features are unavailable.");
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.replace(/\s/g, "");
    if (!normalizedEmail || !/^\d{6,8}$/.test(normalizedToken)) {
      throw new Error("Enter the verification code from your email.");
    }
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: "email"
    });
    if (verifyError) throw verifyError;
  }, []);

  const continueOffline = useCallback(async () => {
    if (!installation || installation.linkedAuthUserId) return;
    await setAccountOnboardingState("deferred");
    await refreshInstallation();
  }, [installation, refreshInstallation]);

  const retryLegacyImport = useCallback(async () => {
    if (!supabase || !session?.user.id) throw new Error("Sign in before retrying cloud migration.");
    setError(null);
    setLegacyImportPrepared(false);
    await uploadAndVerifyLegacyData(supabase, session.user.id, setLegacyImportProgress);
    setLegacyImportPrepared(true);
    await refreshInstallation();
  }, [refreshInstallation, session?.user.id]);

  const saveProfile = useCallback(
    async (values: { displayName: string; handle: string; discoverable: boolean }) => {
      if (!supabase || !session?.user) throw new Error("Sign in before editing your profile.");
      setProfileLoading(true);
      try {
        setProfile(await saveCloudProfile(supabase, session.user, values));
      } finally {
        setProfileLoading(false);
      }
    },
    [session?.user]
  );

  const chooseProfilePhoto = useCallback(async () => {
    if (!supabase || !session?.user) throw new Error("Sign in before choosing a profile picture.");
    setProfileLoading(true);
    try {
      const next = await chooseAndUploadAvatar(supabase, session.user);
      if (next) setProfile(next);
    } finally {
      setProfileLoading(false);
    }
  }, [session?.user]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await unregisterFriendActivityPushToken(supabase).catch(() => undefined);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setSession(null);
    setLegacyImportPrepared(false);
    setLegacyImportProgress(null);
    setProfile(null);
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      cloudAvailable: isSupabaseConfigured,
      localDataReady,
      loading,
      session,
      user: session?.user ?? null,
      error,
      installation,
      onboardingLoading,
      legacyImportPrepared,
      legacyImportProgress,
      profile,
      profileLoading,
      signInWithGoogle,
      requestEmailOtp,
      verifyEmailOtp,
      continueOffline,
      retryLegacyImport,
      saveProfile,
      chooseProfilePhoto,
      signOut,
      clearError: () => setError(null)
    }),
    [
      error,
      installation,
      legacyImportPrepared,
      legacyImportProgress,
      localDataReady,
      loading,
      onboardingLoading,
      profile,
      profileLoading,
      requestEmailOtp,
      session,
      signInWithGoogle,
      signOut,
      verifyEmailOtp,
      continueOffline,
      retryLegacyImport,
      saveProfile,
      chooseProfilePhoto
    ]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider.");
  return value;
}
