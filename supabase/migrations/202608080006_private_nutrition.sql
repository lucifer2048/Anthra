-- Private nutrition sync and optional meal-image storage. This migration is
-- additive: it does not alter, delete, or expose existing Anthra data.
begin;

create table if not exists public.nutrition_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  source text not null check (source in ('photo','barcode','supplement','search','quick-add','manual')),
  consumed_at timestamptz not null,
  local_date date not null,
  timezone text not null,
  image_path text,
  image_mime text,
  analyzer_provider text,
  analyzer_model text,
  analyzer_request_id text,
  confidence double precision check (confidence is null or confidence between 0 and 1),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.nutrition_entry_items (
  id uuid primary key,
  entry_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id text,
  name text not null,
  serving_quantity double precision not null check (serving_quantity >= 0),
  serving_unit text not null,
  serving_grams double precision check (serving_grams is null or serving_grams >= 0),
  calories double precision check (calories is null or calories >= 0),
  protein_grams double precision check (protein_grams is null or protein_grams >= 0),
  carbohydrate_grams double precision check (carbohydrate_grams is null or carbohydrate_grams >= 0),
  fat_grams double precision check (fat_grams is null or fat_grams >= 0),
  fibre_grams double precision check (fibre_grams is null or fibre_grams >= 0),
  sugar_grams double precision check (sugar_grams is null or sugar_grams >= 0),
  sodium_milligrams double precision check (sodium_milligrams is null or sodium_milligrams >= 0),
  nutrient_source text not null,
  nutrient_source_ref text,
  serving_assumption text,
  confidence double precision check (confidence is null or confidence between 0 and 1),
  sort_order integer not null default 0,
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, user_id) references public.nutrition_entries(id, user_id) on delete cascade
);

create table if not exists public.nutrition_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calorie_goal double precision not null check (calorie_goal > 0),
  protein_goal_grams double precision not null check (protein_goal_grams >= 0),
  carbohydrate_goal_grams double precision not null check (carbohydrate_goal_grams >= 0),
  fat_goal_grams double precision not null check (fat_goal_grams >= 0),
  fibre_goal_grams double precision check (fibre_goal_grams is null or fibre_goal_grams >= 0),
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_custom_foods (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('food','supplement','packaged')),
  barcode text,
  serving_quantity double precision not null check (serving_quantity > 0),
  serving_unit text not null,
  serving_grams double precision check (serving_grams is null or serving_grams >= 0),
  calories double precision check (calories is null or calories >= 0),
  protein_grams double precision check (protein_grams is null or protein_grams >= 0),
  carbohydrate_grams double precision check (carbohydrate_grams is null or carbohydrate_grams >= 0),
  fat_grams double precision check (fat_grams is null or fat_grams >= 0),
  fibre_grams double precision check (fibre_grams is null or fibre_grams >= 0),
  sugar_grams double precision check (sugar_grams is null or sugar_grams >= 0),
  sodium_milligrams double precision check (sodium_milligrams is null or sodium_milligrams >= 0),
  nutrient_source text not null,
  nutrient_source_ref text,
  serving_assumption text,
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Service-role-only accounting used by the Edge Function. RLS is enabled with
-- no client policies, so authenticated clients cannot read or change quotas.
create table if not exists public.nutrition_analysis_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  estimated_cost_microunits bigint not null default 0 check (estimated_cost_microunits >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create index if not exists idx_nutrition_entries_user_date on public.nutrition_entries(user_id, local_date, deleted_at);
create index if not exists idx_nutrition_entries_user_updated on public.nutrition_entries(user_id, client_updated_at);
create index if not exists idx_nutrition_items_entry on public.nutrition_entry_items(entry_id, sort_order);
create index if not exists idx_nutrition_items_user_updated on public.nutrition_entry_items(user_id, client_updated_at);
create index if not exists idx_nutrition_custom_user_name on public.nutrition_custom_foods(user_id, lower(name));
create unique index if not exists idx_nutrition_custom_barcode on public.nutrition_custom_foods(user_id, barcode)
  where barcode is not null and deleted_at is null;

alter table public.nutrition_entries enable row level security;
alter table public.nutrition_entry_items enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.nutrition_custom_foods enable row level security;
alter table public.nutrition_analysis_usage enable row level security;

create or replace function public.consume_nutrition_analysis_quota(
  target_user_id uuid,
  daily_limit integer,
  request_cost_microunits bigint default 0
) returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare consumed boolean := false;
begin
  if target_user_id is null or daily_limit <= 0 then return false; end if;
  insert into public.nutrition_analysis_usage (
    user_id, usage_date, request_count, estimated_cost_microunits, updated_at
  ) values (
    target_user_id, current_date, 1, greatest(request_cost_microunits, 0), now()
  )
  on conflict (user_id, usage_date) do update set
    request_count = nutrition_analysis_usage.request_count + 1,
    estimated_cost_microunits = nutrition_analysis_usage.estimated_cost_microunits + greatest(request_cost_microunits, 0),
    updated_at = now()
  where nutrition_analysis_usage.request_count < daily_limit
  returning true into consumed;
  return coalesce(consumed, false);
end
$function$;
revoke all on function public.consume_nutrition_analysis_quota(uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.consume_nutrition_analysis_quota(uuid, integer, bigint) to service_role;

do $policies$
declare table_name text;
begin
  foreach table_name in array array['nutrition_entries','nutrition_entry_items','nutrition_goals','nutrition_custom_foods'] loop
    if not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=table_name and p.policyname=table_name || '_owner_select') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', table_name || '_owner_select', table_name);
    end if;
    if not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=table_name and p.policyname=table_name || '_owner_insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', table_name || '_owner_insert', table_name);
    end if;
    if not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=table_name and p.policyname=table_name || '_owner_update') then
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_owner_update', table_name);
    end if;
    if not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=table_name and p.policyname=table_name || '_owner_delete') then
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', table_name || '_owner_delete', table_name);
    end if;
  end loop;
end
$policies$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anthra-meal-images', 'anthra-meal-images', false, 1500000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=1500000,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

do $storage_policies$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='anthra_meal_images_owner_select') then
    create policy anthra_meal_images_owner_select on storage.objects for select to authenticated
      using (bucket_id='anthra-meal-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='anthra_meal_images_owner_insert') then
    create policy anthra_meal_images_owner_insert on storage.objects for insert to authenticated
      with check (bucket_id='anthra-meal-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='anthra_meal_images_owner_update') then
    create policy anthra_meal_images_owner_update on storage.objects for update to authenticated
      using (bucket_id='anthra-meal-images' and (storage.foldername(name))[1]=(select auth.uid())::text)
      with check (bucket_id='anthra-meal-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='anthra_meal_images_owner_delete') then
    create policy anthra_meal_images_owner_delete on storage.objects for delete to authenticated
      using (bucket_id='anthra-meal-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
end
$storage_policies$;

commit;
