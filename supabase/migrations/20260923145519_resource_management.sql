-- Required for authenticated policies to invoke the private authorization helpers.
grant usage on schema private to authenticated;

create type public.resource_status as enum (
  'available', 'reserved', 'checked_out', 'maintenance', 'unavailable', 'retired'
);

create type public.resource_condition as enum ('excellent', 'good', 'fair', 'poor', 'unknown');

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 160),
  category text not null check (char_length(trim(category)) between 1 and 80),
  description text,
  quantity integer not null default 1 check (quantity > 0),
  available_quantity integer not null default 1 check (available_quantity >= 0 and available_quantity <= quantity),
  location text not null check (char_length(trim(location)) between 1 and 120),
  condition public.resource_condition not null default 'unknown',
  status public.resource_status not null default 'available',
  asset_code text,
  image_url text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((archived_at is null) or status = 'retired')
);

create unique index resources_active_asset_code_key
  on public.resources (organization_id, lower(asset_code))
  where asset_code is not null and archived_at is null;
create index resources_active_organization_idx on public.resources (organization_id, name) where archived_at is null;
create index resources_active_status_idx on public.resources (organization_id, status) where archived_at is null;

create function private.can_manage_resources(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
      and member.is_active
      and member.role in ('admin', 'staff')
  );
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.can_manage_resources(uuid) from public, anon;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
grant execute on function private.can_manage_resources(uuid) to authenticated;

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute procedure private.touch_updated_at();

alter table public.resources enable row level security;
revoke all on table public.resources from anon, authenticated;
grant select, insert, update on table public.resources to authenticated;

create policy "members can view organization resources"
on public.resources for select to authenticated
using ((select private.is_active_organization_member(organization_id)));

create policy "staff can add organization resources"
on public.resources for insert to authenticated
with check ((select private.can_manage_resources(organization_id)));

create policy "staff can update organization resources"
on public.resources for update to authenticated
using ((select private.can_manage_resources(organization_id)))
with check ((select private.can_manage_resources(organization_id)));
