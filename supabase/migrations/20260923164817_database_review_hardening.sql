-- Phase 10: database integrity, index coverage, and RLS maintenance.
-- This migration is intentionally non-destructive: it does not remove tables,
-- columns, historical rows, or valid application access.

-- Keep creation timestamps immutable while maintaining updated_at consistently.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at = old.created_at;
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure private.touch_updated_at();

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute procedure private.touch_updated_at();

-- A reservation must always point to a resource and requester in its organization.
-- Capacity validation cannot enforce this alone because terminal reservations skip
-- capacity checks, so keep the tenant relationship check independent.
create or replace function private.validate_reservation_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  validate_resource boolean := false;
  validate_requester boolean := false;
begin
  if tg_op = 'INSERT' then
    validate_resource := true;
    validate_requester := true;
  elsif tg_op = 'UPDATE' then
    validate_resource := (new.organization_id, new.resource_id)
      is distinct from (old.organization_id, old.resource_id);
    validate_requester := (new.organization_id, new.requested_by)
      is distinct from (old.organization_id, old.requested_by);
  end if;

  if validate_resource and not exists (
    select 1
    from public.resources resource
    where resource.id = new.resource_id
      and resource.organization_id = new.organization_id
  ) then
    raise exception 'The selected resource does not belong to this organization.';
  end if;

  if validate_requester and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.requested_by
      and member.is_active
  ) then
    raise exception 'The requester must be an active member of this organization.';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_reservation_relationships() from public, anon, authenticated;

drop trigger if exists reservations_validate_relationships on public.reservations;
create trigger reservations_validate_relationships
  before insert or update of organization_id, resource_id, requested_by
  on public.reservations
  for each row execute procedure private.validate_reservation_relationships();

-- Maintenance-window authorship is audit evidence and must not be reassigned.
create or replace function private.preserve_resource_unavailability_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'The maintenance period creator cannot be changed.';
  end if;

  return new;
end;
$$;

revoke all on function private.preserve_resource_unavailability_creator() from public, anon, authenticated;

drop trigger if exists resource_unavailability_preserve_creator on public.resource_unavailability;
create trigger resource_unavailability_preserve_creator
  before update of created_by on public.resource_unavailability
  for each row execute procedure private.preserve_resource_unavailability_creator();

-- Cover the application's organization/date and complete resource-history sorts.
create index if not exists reservations_organization_starts_idx
  on public.reservations (organization_id, starts_at, id);
create index if not exists reservations_resource_history_idx
  on public.reservations (resource_id, starts_at desc, id);
create index if not exists reservation_activity_organization_created_idx
  on public.reservation_activity (organization_id, created_at desc, id);

-- Cover foreign keys reported by the Supabase database advisor.
create index if not exists reservation_activity_actor_id_idx
  on public.reservation_activity (actor_id);
create index if not exists reservations_checked_out_by_idx
  on public.reservations (checked_out_by);
create index if not exists reservations_returned_by_idx
  on public.reservations (returned_by);
create index if not exists resource_unavailability_created_by_idx
  on public.resource_unavailability (created_by);
create index if not exists resource_unavailability_organization_id_idx
  on public.resource_unavailability (organization_id);

-- Mirror application input limits in Postgres. NOT VALID avoids rejecting a
-- deployment because of pre-existing rows while still enforcing all new writes.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'resources_asset_code_length'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_asset_code_length
      check (asset_code is null or char_length(asset_code) <= 80) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'resources_image_url_length'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_image_url_length
      check (image_url is null or char_length(image_url) <= 2048) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'resources_description_length'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_description_length
      check (description is null or char_length(description) <= 4000) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'resources_notes_length'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_notes_length
      check (notes is null or char_length(notes) <= 4000) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'reservations_notes_length'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_notes_length
      check (notes is null or char_length(notes) <= 4000) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'resource_unavailability_notes_length'
      and conrelid = 'public.resource_unavailability'::regclass
  ) then
    alter table public.resource_unavailability
      add constraint resource_unavailability_notes_length
      check (notes is null or char_length(notes) <= 4000) not valid;
  end if;
end;
$$;

-- The two previous SELECT policies were both permissive and evaluated for every
-- profile row. One policy preserves their OR semantics with less RLS overhead.
drop policy if exists "users can view their own profile" on public.profiles;
drop policy if exists "staff can view organization member profiles" on public.profiles;
drop policy if exists "users and staff can view permitted profiles" on public.profiles;

create policy "users and staff can view permitted profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.organization_members member
    where member.user_id = profiles.id
      and member.is_active
      and (select private.can_manage_resources(member.organization_id))
  )
);
