-- Friend discovery and lifecycle RPCs. Friendship rows remain read-only to clients;
-- every mutation validates auth.uid() inside a security-definer function.

begin;

create or replace function public.search_anthra_profiles(
  search_text text,
  result_limit integer default 20
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_path text,
  friendship_id uuid,
  friendship_status text,
  requested_by uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    p.user_id,
    p.handle,
    p.display_name,
    p.avatar_path,
    f.id,
    f.status,
    f.requested_by
  from public.profiles p
  left join public.friendships f
    on f.user_low_id = least((select auth.uid()), p.user_id)
   and f.user_high_id = greatest((select auth.uid()), p.user_id)
  where (select auth.uid()) is not null
    and p.user_id <> (select auth.uid())
    and p.discoverable
    and not public.anthra_is_blocked((select auth.uid()), p.user_id)
    and length(trim(search_text)) >= 2
    and (
      p.handle ilike '%' || trim(search_text) || '%'
      or p.display_name ilike '%' || trim(search_text) || '%'
    )
  order by
    case when lower(p.handle) = lower(trim(search_text)) then 0 else 1 end,
    p.handle nulls last,
    p.display_name
  limit least(greatest(coalesce(result_limit, 20), 1), 30);
$function$;

create or replace function public.cancel_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.friendships
  set status = 'declined', responded_at = now()
  where id = request_id
    and status = 'pending'
    and requested_by = auth.uid();
  if not found then raise exception 'Pending friend request not found'; end if;
end;
$function$;

create or replace function public.remove_friend(friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.friendships
  set status = 'declined', responded_at = now()
  where id = friendship_id
    and status = 'accepted'
    and auth.uid() in (user_low_id, user_high_id);
  if not found then raise exception 'Friendship not found'; end if;
end;
$function$;

revoke all on function public.search_anthra_profiles(text, integer) from public;
revoke all on function public.cancel_friend_request(uuid) from public;
revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.search_anthra_profiles(text, integer) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Friends may obtain short-lived signed URLs for each other's private avatars.
do $migration$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'anthra_friend_avatar_select'
  ) then
    create policy anthra_friend_avatar_select on storage.objects
    for select to authenticated
    using (
      bucket_id = 'anthra-profile-avatars'
      and owner_id is not null
      and public.anthra_are_friends(
        (select auth.uid()),
        owner_id::uuid
      )
      and not public.anthra_is_blocked(
        (select auth.uid()),
        owner_id::uuid
      )
    );
  else
    alter policy anthra_friend_avatar_select on storage.objects
    to authenticated
    using (
      bucket_id = 'anthra-profile-avatars'
      and owner_id is not null
      and public.anthra_are_friends(
        (select auth.uid()),
        owner_id::uuid
      )
      and not public.anthra_is_blocked(
        (select auth.uid()),
        owner_id::uuid
      )
    );
  end if;
end
$migration$;

commit;
