alter table public.profiles add column first_name text;
alter table public.profiles add column last_name text;

-- Best-effort backfill for any existing rows (split on first space).
update public.profiles
set
  first_name = coalesce(nullif(split_part(full_name, ' ', 1), ''), full_name),
  last_name = nullif(substring(full_name from position(' ' in full_name) + 1), '')
where first_name is null;

alter table public.profiles alter column first_name set not null;
alter table public.profiles alter column last_name set not null;
alter table public.profiles drop column full_name;

alter table public.proposals add column client_first_name text;
alter table public.proposals add column client_last_name text;

update public.proposals
set
  client_first_name = coalesce(nullif(split_part(client_name, ' ', 1), ''), client_name),
  client_last_name = nullif(substring(client_name from position(' ' in client_name) + 1), '')
where client_first_name is null and client_name is not null;

alter table public.proposals drop column client_name;

-- ============================================================================
-- proposals: post-approval client-response-status tracking (decision #41)
-- ============================================================================
create type public.client_response_status as enum ('pending', 'closed', 'rejected');

alter table public.proposals add column client_response_status public.client_response_status;
alter table public.proposals add column approved_at timestamptz;
alter table public.proposals add column last_client_response_reminder_at timestamptz;

-- New notification event types used by the reminder mechanism (decision #41/#42).
alter type public.notification_event_type add value 'client_response_reminder';
alter type public.notification_event_type add value 'approval_reminder';

-- ============================================================================
-- Replace handle_new_user to populate first_name/last_name instead of the
-- now-dropped full_name. Invite calls (app/api/admin/invite/route.ts) and
-- the seed script now pass first_name/last_name in user metadata.
-- ============================================================================
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
  return new;
end;
$$;

-- ============================================================================
-- profiles RLS: the select-all policy already covers first_name/last_name
-- (no column-level RLS in Postgres) — nothing further needed there.
-- ============================================================================

-- ============================================================================
-- Decision #46: approvers can see every proposal, not just pending_approval/
-- client_rejected. Replaces the narrower policy from 0001_init.sql.
-- ============================================================================
drop policy if exists proposals_select on public.proposals;

create policy proposals_select on public.proposals
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.jwt_role() = 'approver'
  );

-- proposal_sections visibility follows the same widened rule for approvers.
drop policy if exists proposal_sections_select on public.proposal_sections;

create policy proposal_sections_select on public.proposal_sections
  for select to authenticated
  using (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_sections.proposal_id
        and (p.created_by = auth.uid() or public.jwt_role() = 'approver')
    )
  );
