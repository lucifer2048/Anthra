-- Private Anthra profile pictures. Paths are always <auth-user-id>/avatar.jpg.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anthra-profile-avatars',
  'anthra-profile-avatars',
  false,
  1048576,
  array['image/jpeg']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $migration$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'anthra_avatar_owner_select'
  ) then
    create policy anthra_avatar_owner_select on storage.objects
    for select to authenticated
    using (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  else
    alter policy anthra_avatar_owner_select on storage.objects
    to authenticated
    using (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'anthra_avatar_owner_insert'
  ) then
    create policy anthra_avatar_owner_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  else
    alter policy anthra_avatar_owner_insert on storage.objects
    to authenticated
    with check (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'anthra_avatar_owner_update'
  ) then
    create policy anthra_avatar_owner_update on storage.objects
    for update to authenticated
    using (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  else
    alter policy anthra_avatar_owner_update on storage.objects
    to authenticated
    using (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
      bucket_id = 'anthra-profile-avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end
$migration$;

commit;
