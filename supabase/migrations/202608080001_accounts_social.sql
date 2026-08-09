-- Anthra account, private sync, and friend-social foundation.
-- All exposed tables use RLS. Social visibility is derived from accepted
-- friendships and explicit per-metric privacy settings.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text not null default '',
  avatar_path text,
  discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format check (
    handle is null or handle ~ '^[a-z0-9_]{3,24}$'
  )
);

create table if not exists public.privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  share_steps boolean not null default false,
  share_workout_streak boolean not null default false,
  share_workout_count boolean not null default false,
  appear_in_leaderboards boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references auth.users(id) on delete cascade,
  user_high_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(user_low_id, user_high_id),
  check (user_low_id < user_high_id),
  check (requested_by in (user_low_id, user_high_id))
);

create index if not exists friendships_low_status_idx
  on public.friendships(user_low_id, status);
create index if not exists friendships_high_status_idx
  on public.friendships(user_high_id, status);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.daily_private_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key date not null,
  timezone text not null,
  steps integer not null default 0 check (steps between 0 and 200000),
  workout_count integer not null default 0 check (workout_count between 0 and 50),
  workout_streak integer not null default 0 check (workout_streak between 0 and 10000),
  step_source text not null default 'unknown'
    check (step_source in ('health_connect', 'phone_sensor', 'manual', 'unknown')),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(user_id, date_key)
);

-- This deliberately contains only fields a user elected to share. Raw health
-- records and private fields never participate in friend-facing queries.
create table if not exists public.daily_social_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key date not null,
  steps integer,
  workout_count integer,
  workout_streak integer,
  step_source text,
  published_at timestamptz not null default now(),
  primary key(user_id, date_key)
);

create index if not exists daily_social_stats_date_idx
  on public.daily_social_stats(date_key, user_id);

create table if not exists public.legacy_import_batches (
  import_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  manifest jsonb not null,
  state text not null default 'prepared'
    check (state in ('prepared', 'uploading', 'verifying', 'complete', 'failed')),
  record_count integer not null default 0,
  checksum text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, import_id)
);

-- Generic private sync envelope. Domain-specific server tables can be added
-- incrementally without risking legacy imports or cross-device identity.
create table if not exists public.synced_entities (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_type text not null,
  payload jsonb,
  revision bigint not null default 1,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key(user_id, entity_id)
);

create index if not exists synced_entities_changes_idx
  on public.synced_entities(user_id, server_updated_at, entity_id);

create table if not exists public.device_push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  expo_push_token text not null,
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(user_id, device_id),
  unique(expo_push_token)
);

alter table public.profiles enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.daily_private_stats enable row level security;
alter table public.daily_social_stats enable row level security;
alter table public.legacy_import_batches enable row level security;
alter table public.synced_entities enable row level security;
alter table public.device_push_tokens enable row level security;

create or replace function public.anthra_are_friends(viewer uuid, subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select viewer = subject or exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and f.user_low_id = least(viewer, subject)
      and f.user_high_id = greatest(viewer, subject)
  );
$$;

create or replace function public.anthra_is_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = first_user and b.blocked_id = second_user)
       or (b.blocker_id = second_user and b.blocked_id = first_user)
  );
$$;

revoke all on function public.anthra_are_friends(uuid, uuid) from public;
revoke all on function public.anthra_is_blocked(uuid, uuid) from public;
grant execute on function public.anthra_are_friends(uuid, uuid) to authenticated;
grant execute on function public.anthra_is_blocked(uuid, uuid) to authenticated;

create policy profiles_select on public.profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    not public.anthra_is_blocked((select auth.uid()), user_id)
    and (discoverable or public.anthra_are_friends((select auth.uid()), user_id))
  )
);
create policy profiles_insert on public.profiles
for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy privacy_owner_all on public.privacy_settings
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy friendships_participant_select on public.friendships
for select to authenticated
using ((select auth.uid()) in (user_low_id, user_high_id));

create policy blocks_owner_all on public.blocks
for all to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

create policy private_stats_owner_all on public.daily_private_stats
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy social_stats_friend_select on public.daily_social_stats
for select to authenticated
using (
  public.anthra_are_friends((select auth.uid()), user_id)
  and not public.anthra_is_blocked((select auth.uid()), user_id)
);

create policy imports_owner_all on public.legacy_import_batches
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy synced_entities_owner_all on public.synced_entities
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy push_tokens_owner_all on public.device_push_tokens
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.send_friend_request(target_user uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  result public.friendships;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if target_user is null or target_user = caller then raise exception 'Invalid friend target'; end if;
  if public.anthra_is_blocked(caller, target_user) then raise exception 'Friend request unavailable'; end if;

  insert into public.friendships(user_low_id, user_high_id, requested_by, status)
  values (least(caller, target_user), greatest(caller, target_user), caller, 'pending')
  on conflict (user_low_id, user_high_id) do update
    set requested_by = excluded.requested_by,
        status = case when public.friendships.status = 'accepted' then 'accepted' else 'pending' end,
        responded_at = case when public.friendships.status = 'accepted' then public.friendships.responded_at else null end
  returning * into result;
  return result;
end;
$$;

create or replace function public.respond_to_friend_request(request_id uuid, accept_request boolean)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  result public.friendships;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  update public.friendships
  set status = case when accept_request then 'accepted' else 'declined' end,
      responded_at = now()
  where id = request_id
    and status = 'pending'
    and requested_by <> caller
    and caller in (user_low_id, user_high_id)
  returning * into result;
  if result.id is null then raise exception 'Friend request not found'; end if;
  return result;
end;
$$;

create or replace function public.publish_daily_stats(
  stat_date date,
  stat_timezone text,
  stat_steps integer,
  stat_workout_count integer,
  stat_workout_streak integer,
  stat_step_source text,
  stat_client_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  privacy public.privacy_settings;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if stat_steps not between 0 and 200000 then raise exception 'Invalid step count'; end if;
  if stat_workout_count not between 0 and 50 then raise exception 'Invalid workout count'; end if;
  if stat_workout_streak not between 0 and 10000 then raise exception 'Invalid streak'; end if;
  if stat_step_source not in ('health_connect', 'phone_sensor', 'manual', 'unknown') then
    raise exception 'Invalid step source';
  end if;

  insert into public.daily_private_stats(
    user_id, date_key, timezone, steps, workout_count, workout_streak,
    step_source, client_updated_at, updated_at
  ) values (
    caller, stat_date, stat_timezone, stat_steps, stat_workout_count,
    stat_workout_streak, stat_step_source, stat_client_updated_at, now()
  )
  on conflict(user_id, date_key) do update set
    timezone = excluded.timezone,
    steps = excluded.steps,
    workout_count = excluded.workout_count,
    workout_streak = excluded.workout_streak,
    step_source = excluded.step_source,
    client_updated_at = excluded.client_updated_at,
    updated_at = now()
  where excluded.client_updated_at >= public.daily_private_stats.client_updated_at;

  select * into privacy from public.privacy_settings where user_id = caller;
  if coalesce(privacy.appear_in_leaderboards, false) then
    insert into public.daily_social_stats(
      user_id, date_key, steps, workout_count, workout_streak, step_source, published_at
    ) values (
      caller,
      stat_date,
      case when privacy.share_steps and stat_step_source <> 'manual' then stat_steps else null end,
      case when privacy.share_workout_count then stat_workout_count else null end,
      case when privacy.share_workout_streak then stat_workout_streak else null end,
      case when privacy.share_steps and stat_step_source <> 'manual' then stat_step_source else null end,
      now()
    )
    on conflict(user_id, date_key) do update set
      steps = excluded.steps,
      workout_count = excluded.workout_count,
      workout_streak = excluded.workout_streak,
      step_source = excluded.step_source,
      published_at = now();
  else
    delete from public.daily_social_stats where user_id = caller and date_key = stat_date;
  end if;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
revoke all on function public.publish_daily_stats(date, text, integer, integer, integer, text, timestamptz) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.publish_daily_stats(date, text, integer, integer, integer, text, timestamptz) to authenticated;

-- Ensure each new account receives private defaults. This trigger never reads
-- or mutates the user's legacy SQLite data.
create or replace function public.handle_new_anthra_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict(user_id) do nothing;
  insert into public.privacy_settings(user_id)
  values (new.id)
  on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_anthra on auth.users;
create trigger on_auth_user_created_anthra
after insert on auth.users
for each row execute function public.handle_new_anthra_user();
