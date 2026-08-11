# Account & optional auth

**Code:** `src/features/account/`  
**Client:** `src/services/supabaseClient.ts`  
**Gate:** `AccountOnboardingGate` wraps the live app tree in `App.tsx`

## Role

Optional authenticated identity on top of local SQLite. Local data remains the source of truth. When Supabase is not configured, Anthra runs as a guest with no auth UI requirement beyond the normal hub.

## Configuration

| Env | Purpose |
|-----|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key |

Both must be set for `isSupabaseConfigured` / non-null `supabase`. Never ship service-role keys or Google client secrets in the mobile env. Operator setup: [`supabase/README.md`](../supabase/README.md).

## Provider surface (`AccountProvider`)

Exposes session/user, profile, Google OAuth + email OTP, `continueOffline` for eligible legacy installs, legacy import progress, avatar upload, and sign-out. After auth it may trigger legacy verified import, nutrition sync, social stats publish, and friend-activity push registration.

`localDataReady` (from App bootstrap) gates cloud work so SQLite migrations finish first.

## Onboarding gate

`resolveAccountGateDecision` chooses `app | loading | authenticate | migrate`:

- New / unauthenticated installs with cloud configured → authenticate (Google or email OTP).
- Legacy installs that deferred onboarding may continue offline without a session.
- Signed-in users with prepared or already-linked legacy data → app; otherwise migrate (upload + verify private cloud copy without deleting local rows).

## Profile

Display name (≤80 chars), optional handle (`^[a-z0-9_]{3,24}$`), discoverable flag, private avatar in `anthra-profile-avatars` (≤1 MB, 512px). Email is never shown on social surfaces.

## What stays local / excluded

- Vault PIN and credential secrets stay device-bound (Secure Store / vault tables). They are **not** part of legacy import and **not** written into JSON backups.
- Alarm camera frames never leave the device.

## Related

- Friends / leaderboards: [social.md](./social.md)
- Nutrition private sync: [nutrition.md](./nutrition.md)
- Provider order: [app-providers.md](./app-providers.md)
