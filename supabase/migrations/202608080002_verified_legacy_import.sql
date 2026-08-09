-- Adds a server-verifiable link between a legacy import and its private sync
-- envelopes. Run after 202608080001_accounts_social.sql.

begin;

alter table public.synced_entities
  add column if not exists legacy_import_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'synced_entities_legacy_import_owner_fk'
      and conrelid = 'public.synced_entities'::regclass
  ) then
    alter table public.synced_entities
      add constraint synced_entities_legacy_import_owner_fk
      foreign key (user_id, legacy_import_id)
      references public.legacy_import_batches(user_id, import_id);
  end if;
end;
$$;

create index if not exists synced_entities_legacy_import_idx
  on public.synced_entities(user_id, legacy_import_id, entity_id);

create or replace function public.verify_anthra_legacy_import(
  target_import_id uuid,
  expected_record_count integer,
  expected_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller uuid := auth.uid();
  actual_record_count integer;
  actual_checksum text;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if expected_record_count < 0 then raise exception 'Invalid expected record count'; end if;
  if expected_checksum !~ '^[a-f0-9]{64}$' then raise exception 'Invalid expected checksum'; end if;

  perform 1
  from public.legacy_import_batches
  where import_id = target_import_id and user_id = caller
  for update;
  if not found then raise exception 'Import batch not found'; end if;

  select
    count(*)::integer,
    encode(
      digest(coalesce(string_agg(entity_id::text, ',' order by entity_id), ''), 'sha256'),
      'hex'
    )
  into actual_record_count, actual_checksum
  from public.synced_entities
  where user_id = caller and legacy_import_id = target_import_id;

  if actual_record_count <> expected_record_count or actual_checksum <> expected_checksum then
    update public.legacy_import_batches
    set state = 'failed',
        error = format(
          'Verification mismatch: expected %s/%s, received %s/%s',
          expected_record_count,
          expected_checksum,
          actual_record_count,
          actual_checksum
        ),
        updated_at = now()
    where import_id = target_import_id and user_id = caller;
    raise exception 'Legacy import verification failed';
  end if;

  update public.legacy_import_batches
  set state = 'complete',
      record_count = actual_record_count,
      checksum = actual_checksum,
      error = null,
      completed_at = now(),
      updated_at = now()
  where import_id = target_import_id and user_id = caller;

  return jsonb_build_object(
    'importId', target_import_id,
    'recordCount', actual_record_count,
    'checksum', actual_checksum,
    'verifiedAt', now()
  );
end;
$$;

revoke all on function public.verify_anthra_legacy_import(uuid, integer, text) from public;
grant execute on function public.verify_anthra_legacy_import(uuid, integer, text) to authenticated;

commit;
