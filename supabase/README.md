# Supabase setup

1. Create a Supabase project and enable Email/Password sign-in.
2. Add its URL and publishable key to `.env.local` using `.env.example` as the template. Never expose a service-role key to the browser.
3. Link the project with the Supabase CLI, then apply `migrations/20260923132950_authentication_and_roles.sql`.
4. Seed the first organization and its admin membership through the SQL editor or a trusted server-side process. The migration intentionally gives browser clients no direct organization-creation policy.

Role permissions are enforced in PostgreSQL:

- `admin`: can manage organization memberships.
- `staff`: can read their organization and membership list, but cannot alter memberships.
- `member`: has the same read scope and cannot alter memberships.

Future resource and reservation tables must receive the same organization-scoped RLS treatment in their own migrations.
