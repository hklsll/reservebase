create type public.resource_unavailability_reason as enum ('maintenance', 'unavailable');

create table public.resource_unavailability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  resource_id uuid not null references public.resources(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason public.resource_unavailability_reason not null default 'maintenance',
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index resource_unavailability_resource_period_idx
  on public.resource_unavailability (resource_id, starts_at, ends_at);

-- Maintenance windows and reservations lock the same resource row before checking
-- overlaps. Therefore a concurrent reservation and maintenance request cannot both
-- validate against stale availability.
create function private.validate_resource_unavailability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resource_record public.resources;
begin
  select * into resource_record
  from public.resources
  where id = new.resource_id
  for update;

  if not found or resource_record.organization_id <> new.organization_id then
    raise exception 'The selected resource is not available to this organization.';
  end if;

  if resource_record.archived_at is not null then
    raise exception 'Archived resources cannot receive maintenance periods.';
  end if;

  if exists (
    select 1
    from public.reservations reservation
    where reservation.resource_id = new.resource_id
      and reservation.id is distinct from new.id
      and reservation.status in ('pending', 'approved', 'checked_out')
      and reservation.starts_at < new.ends_at
      and reservation.ends_at > new.starts_at
  ) then
    raise exception 'This maintenance period conflicts with an active reservation.';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_resource_unavailability() from public, anon, authenticated;

create trigger resource_unavailability_validate
  before insert or update of resource_id, organization_id, starts_at, ends_at
  on public.resource_unavailability
  for each row execute procedure private.validate_resource_unavailability();

create trigger resource_unavailability_set_updated_at
  before update on public.resource_unavailability
  for each row execute procedure private.touch_updated_at();

create or replace function private.validate_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resource_record public.resources;
  reserved_quantity integer;
begin
  if new.status not in ('pending', 'approved', 'checked_out') then
    return new;
  end if;

  if new.starts_at <= now() then
    raise exception 'Reservations must start in the future.';
  end if;

  select * into resource_record
  from public.resources
  where id = new.resource_id
  for update;

  if not found or resource_record.organization_id <> new.organization_id then
    raise exception 'The selected resource is not available to this organization.';
  end if;

  if resource_record.archived_at is not null or resource_record.status <> 'available' then
    raise exception 'The selected resource is unavailable.';
  end if;

  if exists (
    select 1
    from public.resource_unavailability unavailable_period
    where unavailable_period.resource_id = new.resource_id
      and unavailable_period.starts_at < new.ends_at
      and unavailable_period.ends_at > new.starts_at
  ) then
    raise exception 'The selected resource is unavailable during the requested time.';
  end if;

  if new.quantity > resource_record.available_quantity then
    raise exception 'The requested quantity exceeds the resource availability.';
  end if;

  select coalesce(sum(reservation.quantity), 0) into reserved_quantity
  from public.reservations reservation
  where reservation.resource_id = new.resource_id
    and reservation.id is distinct from new.id
    and reservation.status in ('pending', 'approved', 'checked_out')
    and reservation.starts_at < new.ends_at
    and reservation.ends_at > new.starts_at;

  if reserved_quantity + new.quantity > resource_record.available_quantity then
    raise exception 'Not enough units are available for the selected time range.';
  end if;

  return new;
end;
$$;

create or replace function public.check_resource_availability(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  resource_record public.resources;
  reserved_quantity integer;
begin
  if p_starts_at <= now() or p_starts_at >= p_ends_at then
    raise exception 'Choose a future start time before the end time.';
  end if;

  select * into resource_record
  from public.resources
  where id = p_resource_id;

  if not found
    or resource_record.archived_at is not null
    or resource_record.status <> 'available'
    or not private.is_active_organization_member(resource_record.organization_id) then
    raise exception 'The selected resource is unavailable.';
  end if;

  if exists (
    select 1
    from public.resource_unavailability unavailable_period
    where unavailable_period.resource_id = p_resource_id
      and unavailable_period.starts_at < p_ends_at
      and unavailable_period.ends_at > p_starts_at
  ) then
    return 0;
  end if;

  select coalesce(sum(reservation.quantity), 0) into reserved_quantity
  from public.reservations reservation
  where reservation.resource_id = p_resource_id
    and reservation.status in ('pending', 'approved', 'checked_out')
    and reservation.starts_at < p_ends_at
    and reservation.ends_at > p_starts_at;

  return greatest(resource_record.available_quantity - reserved_quantity, 0);
end;
$$;

alter table public.resource_unavailability enable row level security;
revoke all on table public.resource_unavailability from anon, authenticated;
grant select, insert, update on table public.resource_unavailability to authenticated;

create policy "staff can view organization maintenance periods"
on public.resource_unavailability for select to authenticated
using ((select private.can_manage_resources(organization_id)));

create policy "staff can add organization maintenance periods"
on public.resource_unavailability for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_manage_resources(organization_id))
);

create policy "staff can update organization maintenance periods"
on public.resource_unavailability for update to authenticated
using ((select private.can_manage_resources(organization_id)))
with check ((select private.can_manage_resources(organization_id)));
