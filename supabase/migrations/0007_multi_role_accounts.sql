-- Multi-role accounts: one email can hold BOTH a salesperson and an approver
-- role, but never two of the same role. Supabase Auth still allows exactly
-- one auth.users row per email, so this is modeled as one account that can
-- hold multiple *granted* roles, with `profiles.role` staying the single
-- "active" role reflected in the JWT (via custom_access_token_hook) at any
-- moment - switching is an explicit action (see /api/account/switch-role),
-- not automatic.

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index user_roles_user_id_idx on public.user_roles (user_id);

-- Backfill: every existing profile's current role becomes its first granted role.
insert into public.user_roles (user_id, role)
select id, role from public.profiles
on conflict (user_id, role) do nothing;

-- Keep the "first role granted at account creation" in sync going forward.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, first_name, last_name, email)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'salesperson'),
    coalesce(new.raw_user_meta_data ->> 'first_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email
  );

  insert into public.user_roles (user_id, role)
  values (new.id, coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'salesperson'))
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

alter table public.user_roles enable row level security;

-- Everyone can read their own granted roles (needed for the role-switcher
-- UI); approvers can read everyone's (needed to show "already has this
-- role" context, and matches profiles_select_all's existing openness).
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.jwt_role() = 'approver'
  );

-- No client-side insert/update/delete policy - granting a role (via invite,
-- for a brand-new email, or directly for an email that already has an
-- account) only ever happens server-side through the service-role key.
