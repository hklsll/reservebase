drop policy "members can request reservations" on public.reservations;
drop index public.reservations_resource_active_period_idx;
drop trigger reservations_validate_capacity on public.reservations;

alter table public.reservations alter column status drop default;

create type public.reservation_status_next as enum (
  'pending',
  'approved',
  'rejected',
  'reserved',
  'checked_out',
  'returned',
  'cancelled',
  'overdue',
  'no_show'
);

alter table public.reservations
  alter column status type public.reservation_status_next
  using (
    case status::text
      when 'completed' then 'returned'
      else status::text
    end
  )::public.reservation_status_next;

alter table public.reservations
  alter column status set default 'pending'::public.reservation_status_next;

alter type public.reservation_status rename to reservation_status_legacy;
alter type public.reservation_status_next rename to reservation_status;

create index reservations_resource_active_period_idx
  on public.reservations (resource_id, starts_at, ends_at)
  where status in ('pending', 'approved', 'reserved', 'checked_out', 'overdue');

-- A lifecycle change is only legal along these edges. Final states have no
-- outgoing transitions, so a returned, rejected, cancelled, or no-show record
-- cannot be revived accidentally.
create function private.validate_reservation_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'pending' and new.status in ('approved', 'rejected', 'cancelled'))
    or (old.status = 'approved' and new.status in ('reserved', 'cancelled'))
    or (old.status = 'reserved' and new.status in ('checked_out', 'cancelled', 'no_show'))
    or (old.status = 'checked_out' and new.status in ('returned', 'overdue'))
    or (old.status = 'overdue' and new.status = 'returned')
  ) then
    raise exception 'Invalid reservation status transition from % to %.', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_reservation_status_transition() from public, anon, authenticated;

create trigger reservations_validate_status_transition
  before update of status on public.reservations
  for each row execute procedure private.validate_reservation_status_transition();

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
  if new.status not in ('pending', 'approved', 'reserved', 'checked_out', 'overdue') then
    return new;
  end if;

  if tg_op = 'INSERT' and new.starts_at <= now() then
    raise exception 'Reservations must start in the future.';
  end if;

  if tg_op = 'UPDATE'
    and (new.resource_id, new.organization_id, new.starts_at, new.ends_at, new.quantity)
      is distinct from (old.resource_id, old.organization_id, old.starts_at, old.ends_at, old.quantity)
    and new.starts_at <= now() then
    raise exception 'Past reservation times cannot be changed.';
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
    and (
      reservation.status = 'overdue'
      or (
        reservation.status in ('pending', 'approved', 'reserved', 'checked_out')
        and reservation.starts_at < new.ends_at
        and reservation.ends_at > new.starts_at
      )
    );

  if reserved_quantity + new.quantity > resource_record.available_quantity then
    raise exception 'Not enough units are available for the selected time range.';
  end if;

  return new;
end;
$$;

create trigger reservations_validate_capacity
  before insert or update of resource_id, organization_id, starts_at, ends_at, quantity, status
  on public.reservations
  for each row execute procedure private.validate_reservation_capacity();

create or replace function private.validate_resource_unavailability()
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
      and (
        reservation.status = 'overdue'
        or (
          reservation.status in ('pending', 'approved', 'reserved', 'checked_out')
          and reservation.starts_at < new.ends_at
          and reservation.ends_at > new.starts_at
        )
      )
  ) then
    raise exception 'This maintenance period conflicts with an active reservation.';
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
    and (
      reservation.status = 'overdue'
      or (
        reservation.status in ('pending', 'approved', 'reserved', 'checked_out')
        and reservation.starts_at < p_ends_at
        and reservation.ends_at > p_starts_at
      )
    );

  return greatest(resource_record.available_quantity - reserved_quantity, 0);
end;
$$;

create or replace function public.cancel_my_reservation(p_reservation_id uuid)
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
    and status in ('pending', 'approved')
    and private.is_active_organization_member(organization_id);

  if not found then
    raise exception 'This reservation cannot be cancelled.';
  end if;
end;
$$;

revoke all on function public.check_resource_availability(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.check_resource_availability(uuid, timestamptz, timestamptz) to authenticated;
revoke all on function public.cancel_my_reservation(uuid) from public, anon;
grant execute on function public.cancel_my_reservation(uuid) to authenticated;

create policy "members can request reservations"
on public.reservations for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and status = 'pending'
  and (select private.is_active_organization_member(organization_id))
);

drop type public.reservation_status_legacy;
