create type public.reservation_status as enum (
  'pending', 'approved', 'checked_out', 'completed', 'cancelled', 'rejected'
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  resource_id uuid not null references public.resources(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  quantity integer not null default 1 check (quantity > 0),
  purpose text not null check (char_length(trim(purpose)) between 1 and 500),
  notes text,
  status public.reservation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index reservations_resource_active_period_idx
  on public.reservations (resource_id, starts_at, ends_at)
  where status in ('pending', 'approved', 'checked_out');
create index reservations_requester_created_idx on public.reservations (requested_by, created_at desc);
create index reservations_organization_created_idx on public.reservations (organization_id, created_at desc);

-- Serialize booking checks per resource. This avoids concurrent requests reserving
-- more units than are available, while still allowing non-overlapping reservations.
create function private.validate_reservation_capacity()
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

revoke all on function private.validate_reservation_capacity() from public, anon, authenticated;

create trigger reservations_validate_capacity
  before insert or update of resource_id, organization_id, starts_at, ends_at, quantity, status
  on public.reservations
  for each row execute procedure private.validate_reservation_capacity();

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute procedure private.touch_updated_at();

-- This RPC only returns remaining quantity; it exposes no reservation details.
create function public.check_resource_availability(
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

  select coalesce(sum(reservation.quantity), 0) into reserved_quantity
  from public.reservations reservation
  where reservation.resource_id = p_resource_id
    and reservation.status in ('pending', 'approved', 'checked_out')
    and reservation.starts_at < p_ends_at
    and reservation.ends_at > p_starts_at;

  return greatest(resource_record.available_quantity - reserved_quantity, 0);
end;
$$;

revoke all on function public.check_resource_availability(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.check_resource_availability(uuid, timestamptz, timestamptz) to authenticated;

create function public.cancel_my_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.reservations
  set status = 'cancelled'
  where id = p_reservation_id
    and requested_by = (select auth.uid())
    and status in ('pending', 'approved');

  if not found then
    raise exception 'This reservation cannot be cancelled.';
  end if;
end;
$$;

revoke all on function public.cancel_my_reservation(uuid) from public, anon;
grant execute on function public.cancel_my_reservation(uuid) to authenticated;

alter table public.reservations enable row level security;
revoke all on table public.reservations from anon, authenticated;
grant select, insert, update on table public.reservations to authenticated;

create policy "members can view their reservations"
on public.reservations for select to authenticated
using (
  requested_by = (select auth.uid())
  or (select private.can_manage_resources(organization_id))
);

create policy "members can request reservations"
on public.reservations for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and status = 'pending'
  and (select private.is_active_organization_member(organization_id))
);

create policy "staff can manage organization reservations"
on public.reservations for update to authenticated
using ((select private.can_manage_resources(organization_id)))
with check ((select private.can_manage_resources(organization_id)));
