create type public.reservation_activity_kind as enum (
  'requested', 'status_changed', 'checked_out', 'returned'
);

alter table public.reservations
  add column actual_checkout_at timestamptz,
  add column checked_out_by uuid references auth.users(id) on delete restrict,
  add column received_by text,
  add column condition_out public.resource_condition,
  add column checkout_notes text,
  add column actual_returned_at timestamptz,
  add column returned_by uuid references auth.users(id) on delete restrict,
  add column condition_in public.resource_condition,
  add column return_notes text;

create table public.reservation_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  resource_id uuid not null references public.resources(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  kind public.reservation_activity_kind not null,
  previous_status public.reservation_status,
  next_status public.reservation_status,
  created_at timestamptz not null default now()
);

create index reservation_activity_reservation_created_idx
  on public.reservation_activity (reservation_id, created_at desc);
create index reservation_activity_resource_created_idx
  on public.reservation_activity (resource_id, created_at desc);

-- Check-out and return evidence is immutable once recorded. The actor check
-- prevents a caller from attributing custody to another staff member.
create function private.validate_reservation_custody()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (
      new.actual_checkout_at,
      new.checked_out_by,
      new.received_by,
      new.condition_out,
      new.checkout_notes,
      new.actual_returned_at,
      new.returned_by,
      new.condition_in,
      new.return_notes
    ) is distinct from (
      old.actual_checkout_at,
      old.checked_out_by,
      old.received_by,
      old.condition_out,
      old.checkout_notes,
      old.actual_returned_at,
      old.returned_by,
      old.condition_in,
      old.return_notes
    ) and old.actual_checkout_at is not null and new.status <> 'returned' then
      raise exception 'Recorded check-out details cannot be changed.';
    end if;
  end if;

  if new.status in ('checked_out', 'overdue', 'returned') then
    if new.actual_checkout_at is null
      or new.checked_out_by is null
      or nullif(trim(new.received_by), '') is null
      or new.condition_out is null then
      raise exception 'Check-out time, recipient, staff member, and condition are required.';
    end if;

    if new.actual_checkout_at > now() then
      raise exception 'Check-out time cannot be in the future.';
    end if;

    if new.checked_out_by <> (select auth.uid()) then
      raise exception 'The check-out staff member must be the signed-in user.';
    end if;
  elsif new.actual_checkout_at is not null
    or new.checked_out_by is not null
    or new.received_by is not null
    or new.condition_out is not null
    or new.checkout_notes is not null then
    raise exception 'Custody details require a checked-out reservation.';
  end if;

  if new.status = 'returned' then
    if new.actual_returned_at is null
      or new.returned_by is null
      or new.condition_in is null then
      raise exception 'Return time, staff member, and return condition are required.';
    end if;

    if new.actual_returned_at > now()
      or new.actual_returned_at < new.actual_checkout_at then
      raise exception 'Return time must be after check-out and cannot be in the future.';
    end if;

    if new.returned_by <> (select auth.uid()) then
      raise exception 'The return staff member must be the signed-in user.';
    end if;
  elsif new.actual_returned_at is not null
    or new.returned_by is not null
    or new.condition_in is not null
    or new.return_notes is not null then
    raise exception 'Return details require a returned reservation.';
  end if;

  if char_length(new.received_by) > 160
    or char_length(new.checkout_notes) > 4000
    or char_length(new.return_notes) > 4000 then
    raise exception 'Custody notes are too long.';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_reservation_custody() from public, anon, authenticated;

create trigger reservations_validate_custody
  before insert or update of status, actual_checkout_at, checked_out_by, received_by, condition_out, checkout_notes, actual_returned_at, returned_by, condition_in, return_notes
  on public.reservations
  for each row execute procedure private.validate_reservation_custody();

create function private.record_reservation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_kind public.reservation_activity_kind;
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_activity (organization_id, reservation_id, resource_id, actor_id, kind, next_status)
    values (new.organization_id, new.id, new.resource_id, (select auth.uid()), 'requested', new.status);
    return new;
  end if;

  if new.status is distinct from old.status then
    activity_kind := case new.status
      when 'checked_out' then 'checked_out'
      when 'returned' then 'returned'
      else 'status_changed'
    end;

    insert into public.reservation_activity (organization_id, reservation_id, resource_id, actor_id, kind, previous_status, next_status)
    values (new.organization_id, new.id, new.resource_id, (select auth.uid()), activity_kind, old.status, new.status);
  end if;

  return new;
end;
$$;

revoke all on function private.record_reservation_activity() from public, anon, authenticated;

create trigger reservations_record_activity
  after insert or update of status on public.reservations
  for each row execute procedure private.record_reservation_activity();

create function private.apply_return_condition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'returned' and old.status is distinct from 'returned' then
    update public.resources
    set condition = new.condition_in
    where id = new.resource_id;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_return_condition() from public, anon, authenticated;

create trigger reservations_apply_return_condition
  after update of status on public.reservations
  for each row execute procedure private.apply_return_condition();

-- Existing reservations receive a baseline history event so the log remains
-- useful immediately after the migration.
insert into public.reservation_activity (organization_id, reservation_id, resource_id, kind, next_status, created_at)
select organization_id, id, resource_id, 'requested', status, created_at
from public.reservations;

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
    select 1 from public.resource_unavailability unavailable_period
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
      or (reservation.status = 'checked_out' and reservation.ends_at <= now())
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

create or replace function private.validate_resource_unavailability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resource_record public.resources;
begin
  select * into resource_record from public.resources where id = new.resource_id for update;

  if not found or resource_record.organization_id <> new.organization_id then
    raise exception 'The selected resource is not available to this organization.';
  end if;

  if resource_record.archived_at is not null then
    raise exception 'Archived resources cannot receive maintenance periods.';
  end if;

  if exists (
    select 1 from public.reservations reservation
    where reservation.resource_id = new.resource_id
      and (
        reservation.status = 'overdue'
        or (reservation.status = 'checked_out' and reservation.ends_at <= now())
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

  select * into resource_record from public.resources where id = p_resource_id;

  if not found
    or resource_record.archived_at is not null
    or resource_record.status <> 'available'
    or not private.is_active_organization_member(resource_record.organization_id) then
    raise exception 'The selected resource is unavailable.';
  end if;

  if exists (
    select 1 from public.resource_unavailability unavailable_period
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
      or (reservation.status = 'checked_out' and reservation.ends_at <= now())
      or (
        reservation.status in ('pending', 'approved', 'reserved', 'checked_out')
        and reservation.starts_at < p_ends_at
        and reservation.ends_at > p_starts_at
      )
    );

  return greatest(resource_record.available_quantity - reserved_quantity, 0);
end;
$$;

alter table public.reservation_activity enable row level security;
revoke all on table public.reservation_activity from anon, authenticated;
grant select on table public.reservation_activity to authenticated;

create policy "members can view relevant reservation activity"
on public.reservation_activity for select to authenticated
using (
  (select private.can_manage_resources(organization_id))
  or exists (
    select 1 from public.reservations reservation
    where reservation.id = reservation_activity.reservation_id
      and reservation.requested_by = (select auth.uid())
  )
);
