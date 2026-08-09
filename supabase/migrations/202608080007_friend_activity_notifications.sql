-- Opt-in motivational notifications for accepted friends. Push tokens remain
-- owner-only; the delivery Edge Function reads them with the service role.

alter table public.privacy_settings
  add column if not exists share_activity_notifications boolean not null default false,
  add column if not exists receive_activity_notifications boolean not null default false;

create table if not exists public.friend_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('workout_started', 'daily_step_goal_completed')),
  date_key date not null,
  timezone text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  unique(actor_id, kind, date_key)
);

create index if not exists friend_activity_events_actor_created_idx
  on public.friend_activity_events(actor_id, created_at desc);

alter table public.friend_activity_events enable row level security;

-- No client policies are intentional. The authenticated user can submit an
-- event only through the authenticated Edge Function, and only its service
-- client can inspect or update delivery records.

create or replace function public.register_device_push_token(
  target_device_id uuid,
  target_expo_push_token text,
  target_platform text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if target_device_id is null then raise exception 'Device ID required'; end if;
  if target_expo_push_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$'
     and target_expo_push_token !~ '^ExpoPushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;
  if target_platform not in ('android', 'ios') then raise exception 'Invalid platform'; end if;

  delete from public.device_push_tokens
  where expo_push_token = target_expo_push_token and user_id <> caller;

  insert into public.device_push_tokens(
    user_id, device_id, expo_push_token, platform, enabled, updated_at
  ) values (
    caller, target_device_id, target_expo_push_token, target_platform, true, now()
  )
  on conflict(user_id, device_id) do update set
    expo_push_token = excluded.expo_push_token,
    platform = excluded.platform,
    enabled = true,
    updated_at = now();
end;
$$;

create or replace function public.unregister_device_push_token(target_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.device_push_tokens
  set enabled = false, updated_at = now()
  where user_id = auth.uid() and device_id = target_device_id;
end;
$$;

revoke all on function public.register_device_push_token(uuid, text, text) from public;
revoke all on function public.unregister_device_push_token(uuid) from public;
grant execute on function public.register_device_push_token(uuid, text, text) to authenticated;
grant execute on function public.unregister_device_push_token(uuid) to authenticated;
