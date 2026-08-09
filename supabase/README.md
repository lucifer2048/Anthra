# Anthra Supabase setup

Apply the SQL files in filename order in the Supabase SQL editor:

1. `202608080001_accounts_social.sql`
2. `202608080002_verified_legacy_import.sql`
3. `202608080003_private_avatars.sql`
4. `202608080004_friends_leaderboards.sql`
5. `202608080005_avatar_storage_hardening.sql`
6. `202608080006_private_nutrition.sql`
7. `202608080007_friend_activity_notifications.sql`

The third migration creates (or repairs) a private, 1 MB `anthra-profile-avatars` bucket and
owner-only Storage policies. The fifth migration applies those corrected limits to projects
that previously ran migration 003. Do not change the bucket to public.

## Email verification codes

In **Authentication → Email Templates → Magic Link**, make the message display
the six-digit token using `{{ .Token }}`. For example:

```html
<h2>Your Anthra verification code</h2>
<p>Enter this code in Anthra:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>If you did not request this code, you can ignore this email.</p>
```

Keep the Email provider enabled. Before production launch, configure custom SMTP
and test delivery, expiry, resend throttling, and spam-folder behavior.

## Google OAuth

- In Google Cloud, set the OAuth web client's authorized redirect URI to
  `https://<project-ref>.supabase.co/auth/v1/callback`.
- In Supabase **Authentication → Providers → Google**, add that web client ID and
  secret and enable the provider.
- In Supabase **Authentication → URL Configuration**, add
  `anthra://auth/callback` to the redirect allow list.

Never place the Google client secret or a Supabase service-role key in the app's
`.env`. The mobile app uses only the public Supabase URL and publishable key.

## Friend activity push notifications

Deploy the authenticated `notify-friend-activity` Edge Function after migration 007. The
function uses Supabase's built-in URL, anon-key, and service-role secrets and sends only to
registered devices belonging to accepted, unblocked friends who opted in. Set
`EXPO_PUBLIC_EAS_PROJECT_ID` in the mobile build environment to the EAS project UUID so the
app can obtain Expo push tokens.

## Private nutrition and image analysis

Migration 006 creates private nutrition tables with owner-only RLS, an optional private meal-image
bucket, and service-role-only quota accounting. Deploy `analyze-nutrition-image` and configure its
server-side variables as described in [`../doc/nutrition.md`](../doc/nutrition.md). Meal details and
photos are intentionally excluded from all friends and leaderboard queries.
