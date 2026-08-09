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
import { AppState } from "react-native";

import { useAccount } from "../account/AccountProvider";
import { supabase } from "../../services/supabaseClient";
import { getDeviceTimeZone, getTodayLabelInTimeZone } from "../../utils/timezone";
import {
  deleteSocialSnapshotCache,
  loadSocialSnapshotCache,
  saveSocialSnapshotCache
} from "./socialCacheRepository";
import { clearSocialAvatarCache, loadSocialSnapshotData } from "./socialService";
import type { SocialSnapshot } from "./socialTypes";

export const SOCIAL_CACHE_FRESH_MS = 60_000;

type RefreshOptions = { force?: boolean };

type SocialContextValue = {
  snapshot: SocialSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: (options?: RefreshOptions) => Promise<SocialSnapshot | null>;
};

const SocialContext = createContext<SocialContextValue | null>(null);

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Could not refresh friends.";
}

export function SocialProvider({
  children,
  localDataReady
}: {
  children: ReactNode;
  localDataReady: boolean;
}) {
  const account = useAccount();
  const userId = account.user?.id ?? null;
  const [snapshot, setSnapshot] = useState<SocialSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef<SocialSnapshot | null>(null);
  const activeUserIdRef = useRef<string | null>(userId);
  const previousUserIdRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<SocialSnapshot | null> | null>(null);

  const commit = useCallback((next: SocialSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    const client = supabase;
    const requestedUserId = userId;
    if (!client || !localDataReady || !requestedUserId) return null;
    const today = getTodayLabelInTimeZone(getDeviceTimeZone());
    const current = snapshotRef.current;
    const isFresh = current?.accountId === requestedUserId
      && current.dateKey === today
      && Date.now() - current.fetchedAt < SOCIAL_CACHE_FRESH_MS;
    if (!options.force && isFresh) return current;
    if (inFlightRef.current) {
      if (!options.force) return inFlightRef.current;
      setRefreshing(true);
      try {
        return await inFlightRef.current;
      } finally {
        if (activeUserIdRef.current === requestedUserId) setRefreshing(false);
      }
    }

    if (options.force && current?.accountId === requestedUserId) setRefreshing(true);
    else if (!current || current.accountId !== requestedUserId) setLoading(true);
    setError(null);
    let request: Promise<SocialSnapshot | null>;
    request = loadSocialSnapshotData(client, requestedUserId)
      .then(async (data) => {
        const next: SocialSnapshot = {
          accountId: requestedUserId,
          dateKey: today,
          ...data,
          fetchedAt: Date.now()
        };
        if (activeUserIdRef.current !== requestedUserId) return null;
        commit(next);
        await saveSocialSnapshotCache(next);
        return next;
      })
      .catch((refreshError: unknown) => {
        if (activeUserIdRef.current === requestedUserId) setError(messageOf(refreshError));
        throw refreshError;
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (activeUserIdRef.current === requestedUserId) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    inFlightRef.current = request;
    return request;
  }, [commit, localDataReady, userId]);

  useEffect(() => {
    activeUserIdRef.current = userId;
    const previousUserId = previousUserIdRef.current;
    previousUserIdRef.current = userId;
    const previousRequest = inFlightRef.current;
    inFlightRef.current = null;
    commit(null);
    setError(null);
    setRefreshing(false);

    if (previousUserId && previousUserId !== userId) {
      clearSocialAvatarCache(previousUserId);
      const purge = () => deleteSocialSnapshotCache(previousUserId).catch(() => undefined);
      if (previousRequest) previousRequest.catch(() => null).finally(purge);
      else purge();
    }
    if (!userId || !localDataReady) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const hydrate = async () => {
      const cached = await loadSocialSnapshotCache(userId);
      if (!active || activeUserIdRef.current !== userId) return;
      if (cached) {
        const today = getTodayLabelInTimeZone(getDeviceTimeZone());
        commit(cached.dateKey === today
          ? cached
          : { ...cached, dateKey: today, leaderboard: [], fetchedAt: 0 });
        setLoading(false);
      }
      await refresh();
    };
    hydrate().catch((hydrateError: unknown) => {
      if (active) {
        setError(messageOf(hydrateError));
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [commit, localDataReady, refresh, userId]);

  useEffect(() => {
    if (!userId) return;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh().catch(() => undefined);
    });
    return () => listener.remove();
  }, [refresh, userId]);

  const value = useMemo<SocialContextValue>(() => ({
    snapshot,
    loading,
    refreshing,
    error,
    refresh
  }), [error, loading, refresh, refreshing, snapshot]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial(): SocialContextValue {
  const value = useContext(SocialContext);
  if (!value) throw new Error("useSocial must be used inside SocialProvider.");
  return value;
}
