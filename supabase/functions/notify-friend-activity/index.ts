import { createClient } from "npm:@supabase/supabase-js@2";

const KINDS = new Set(["workout_started", "daily_step_goal_completed"]);
const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type ActivityRequest = {
  kind?: string;
  dateKey?: string;
  timezone?: string;
  occurredAt?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

function validPushToken(value: unknown): value is string {
  return typeof value === "string" && /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(value);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return json({ error: "Server configuration is incomplete" }, 503);

  const userClient = createClient(url, anon, { global: { headers: { authorization: auth } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Authentication required" }, 401);

  let body: ActivityRequest;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.kind || !KINDS.has(body.kind)) return json({ error: "Invalid activity kind" }, 400);
  if (!body.dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateKey)) return json({ error: "Invalid date" }, 400);
  if (!body.timezone || body.timezone.length > 100) return json({ error: "Invalid timezone" }, 400);
  const occurredAt = Date.parse(body.occurredAt || "");
  if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 5 * 60_000 || occurredAt < Date.now() - 36 * 60 * 60_000) {
    return json({ error: "Activity time is outside the allowed window" }, 400);
  }
  const utcDay = new Date().toISOString().slice(0, 10);
  const adjacentUtcDays = [-1, 0, 1].map((offset) => {
    const date = new Date(`${utcDay}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
  if (!adjacentUtcDays.includes(body.dateKey)) return json({ error: "Activity date is outside the allowed window" }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: actorPrivacy, error: privacyError } = await admin
    .from("privacy_settings")
    .select("share_activity_notifications")
    .eq("user_id", user.id)
    .maybeSingle();
  if (privacyError) return json({ error: "Could not check sharing preferences" }, 500);
  if (actorPrivacy?.share_activity_notifications !== true) {
    return json({ delivered: 0, reason: "sharing_disabled" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count: recentEventCount, error: rateError } = await admin
    .from("friend_activity_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", user.id)
    .gte("created_at", since);
  if (rateError) return json({ error: "Could not check activity rate" }, 500);
  if ((recentEventCount || 0) >= 6) return json({ delivered: 0, reason: "rate_limited" }, 429);

  const { data: event, error: eventError } = await admin
    .from("friend_activity_events")
    .insert({ actor_id: user.id, kind: body.kind, date_key: body.dateKey, timezone: body.timezone, occurred_at: new Date(occurredAt).toISOString() })
    .select("id")
    .single();
  if (eventError?.code === "23505") return json({ delivered: 0, reason: "already_sent" });
  if (eventError || !event) return json({ error: "Could not record activity" }, 500);

  const { data: friendships, error: friendshipError } = await admin
    .from("friendships")
    .select("user_low_id,user_high_id")
    .eq("status", "accepted")
    .or(`user_low_id.eq.${user.id},user_high_id.eq.${user.id}`);
  if (friendshipError) return json({ error: "Could not load friends" }, 500);
  const friendIds = (friendships || []).map((row) => row.user_low_id === user.id ? row.user_high_id : row.user_low_id);
  if (!friendIds.length) return json({ delivered: 0 });

  const [blockedResult, privacyResult, tokenResult, profileResult] = await Promise.all([
    admin.from("blocks").select("blocker_id,blocked_id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    admin.from("privacy_settings").select("user_id,receive_activity_notifications").in("user_id", friendIds),
    admin.from("device_push_tokens").select("user_id,expo_push_token").in("user_id", friendIds).eq("enabled", true),
    admin.from("profiles").select("display_name,handle").eq("user_id", user.id).maybeSingle()
  ]);
  if (blockedResult.error || privacyResult.error || tokenResult.error || profileResult.error) {
    return json({ error: "Could not resolve notification recipients" }, 500);
  }
  const blocked = blockedResult.data;
  const recipientPrivacy = privacyResult.data;
  const tokens = tokenResult.data;
  const profile = profileResult.data;
  const blockedIds = new Set((blocked || []).map((row) => row.blocker_id === user.id ? row.blocked_id : row.blocker_id));
  const enabledIds = new Set((recipientPrivacy || []).filter((row) => row.receive_activity_notifications).map((row) => row.user_id));
  const pushTokens = [...new Set((tokens || [])
    .filter((row) => enabledIds.has(row.user_id) && !blockedIds.has(row.user_id) && validPushToken(row.expo_push_token))
    .map((row) => row.expo_push_token))];
  if (!pushTokens.length) return json({ delivered: 0 });

  const name = profile?.display_name?.trim() || profile?.handle || "Your friend";
  const title = body.kind === "workout_started" ? "A friend is training" : "Daily goal reached";
  const message = body.kind === "workout_started"
    ? `${name} started a workout. Time to make your move—don't fall behind!`
    : `${name} just hit today's step goal. Think you can catch them?`;
  let delivered = 0;
  for (let offset = 0; offset < pushTokens.length; offset += 100) {
    const batch = pushTokens.slice(offset, offset + 100).map((to) => ({
      to, title, body: message, sound: "default", channelId: "friend-activity",
      data: { type: "friend_activity", kind: body.kind, actorId: user.id }
    }));
    const response = await fetch(EXPO_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "gzip, deflate" },
      body: JSON.stringify(batch)
    });
    if (response.ok) delivered += batch.length;
  }
  await admin.from("friend_activity_events").update({ recipient_count: delivered }).eq("id", event.id);
  return json({ delivered });
});
