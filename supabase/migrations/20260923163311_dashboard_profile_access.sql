create policy "staff can view organization member profiles"
on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.user_id = profiles.id
      and member.is_active
      and (select private.can_manage_resources(member.organization_id))
  )
);
