create type public.app_role as enum ('admin', 'staff', 'member');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(trim(full_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id) where is_active;
create index organization_members_organization_id_idx on public.organization_members (organization_id) where is_active;

create schema if not exists private;

-- These functions only answer questions about the caller. They are kept out of
-- the exposed public schema and are not callable by anon or PUBLIC.
create function private.is_active_organization_member(target_organization_id uuid)
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
  );
$$;

create function private.is_organization_admin(target_organization_id uuid)
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
      and member.role = 'admin'
  );
$$;

revoke all on function private.is_active_organization_member(uuid) from public, anon;
revoke all on function private.is_organization_admin(uuid) from public, anon;
grant execute on function private.is_active_organization_member(uuid) to authenticated;
grant execute on function private.is_organization_admin(uuid) to authenticated;

create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.create_profile_for_new_user();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

revoke all on table public.organizations, public.profiles, public.organization_members from anon;
revoke all on table public.organizations, public.profiles, public.organization_members from authenticated;
grant select on table public.organizations to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.organization_members to authenticated;

create policy "members can view their organizations"
on public.organizations for select to authenticated
using ((select private.is_active_organization_member(id)));

create policy "users can view their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "users can update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "members can view organization members"
on public.organization_members for select to authenticated
using ((select private.is_active_organization_member(organization_id)));

create policy "admins can add organization members"
on public.organization_members for insert to authenticated
with check ((select private.is_organization_admin(organization_id)));

create policy "admins can update organization members"
on public.organization_members for update to authenticated
using ((select private.is_organization_admin(organization_id)))
with check ((select private.is_organization_admin(organization_id)));

create policy "admins can remove organization members"
on public.organization_members for delete to authenticated
using ((select private.is_organization_admin(organization_id)));
