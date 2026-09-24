-- Keep the two authenticated RPCs available to the application, but remove
-- search-path resolution from their SECURITY DEFINER execution context.
-- Their bodies already use schema-qualified tables/functions and retain their
-- caller/organization checks.
alter function public.check_resource_availability(uuid, timestamptz, timestamptz)
  set search_path = '';

alter function public.cancel_my_reservation(uuid)
  set search_path = '';
