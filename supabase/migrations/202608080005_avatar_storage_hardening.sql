-- Reconcile avatar storage settings for projects that already applied migration 003.

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

commit;
