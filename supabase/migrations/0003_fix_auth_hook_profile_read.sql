-- Fix: custom_access_token_hook failed at login with
-- "Error running hook URI: pg-functions://postgres/public/custom_access_token_hook".
--
-- Root cause: granting EXECUTE on the hook function to supabase_auth_admin
-- (done in 0001_init.sql) only lets that role CALL the function — it does
-- not grant it access to the tables the function reads. profiles has RLS
-- enabled with a policy scoped to `authenticated`, and supabase_auth_admin
-- is a separate role that isn't `authenticated`, so its SELECT inside the
-- hook was blocked. This is Supabase's own documented gap for this pattern:
-- the calling role needs both a table-level GRANT and its own RLS policy.
grant select on public.profiles to supabase_auth_admin;

create policy profiles_select_for_auth_hook on public.profiles
  as permissive
  for select
  to supabase_auth_admin
  using (true);
