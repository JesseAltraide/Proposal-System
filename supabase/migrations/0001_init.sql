-- AI Proposal Application — initial schema
-- Merges the data model from proposal-app-build-spec.md with full-flow.md
-- (full-flow.md wins on conflicts, per project instructions).

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto;

-- ============================================================================
-- Enums
-- ============================================================================
create type public.user_role as enum ('salesperson', 'approver');

-- NOTE: 'delivered' from proposal-app-build-spec.md's status enum is deliberately
-- dropped here — full-flow.md never introduces it as a distinct status; the
-- Stage 6 delivery pipeline fires immediately on 'approved' and delivery_log
-- tracks the pipeline steps, so a separate 'delivered' status would be redundant.
create type public.proposal_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'client_rejected'
);

create type public.section_key as enum (
  'introduction',
  'proposed_solution',
  'deliverables',
  'timeline',
  'pricing',
  'next_steps'
);

create type public.generation_status as enum ('generated', 'scanty', 'missing');

create type public.approval_decision as enum ('approved', 'rejected');

create type public.delivery_event_type as enum (
  'pdf_generated',
  'access_code_sent',
  'client_notification_sent',
  'access_verified',
  'proposal_viewed'
);

create type public.delivery_status as enum ('success', 'failed');

create type public.notification_event_type as enum (
  'approval_requested',
  'approved',
  'rejected',
  'generation_complete',
  'client_rejection_flagged',
  'revision_unlocked'
);

create type public.revision_decision as enum ('pending', 'unlocked', 'declined');

-- ============================================================================
-- profiles — role lives here, mirrored into the JWT by the access-token hook
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created via the invite
-- flow. Role/full_name are passed through invite metadata (raw_user_meta_data)
-- by the inviting admin/approver — see SETUP.md for the invite call shape.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'salesperson'),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Custom access token hook — embeds role directly in the JWT
-- Must also be wired up in Supabase Dashboard -> Authentication -> Hooks
-- (see SETUP.md). Cannot be enabled via SQL alone.
-- ============================================================================
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_role public.user_role;
begin
  select role into user_role from public.profiles where id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role::text));
  else
    claims := jsonb_set(claims, '{user_role}', to_jsonb('salesperson'::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- Helper used inside RLS policies to read the role out of the JWT without a
-- fresh table lookup on every request.
create function public.jwt_role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', '')
$$;

-- ============================================================================
-- proposals
-- ============================================================================
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  status public.proposal_status not null default 'draft',

  -- Category 1 fields — verbatim, never rewritten
  client_name text,
  client_email text,
  company_name text,
  date_of_call date,
  salesperson_name text,
  proposed_timeline text,
  estimated_pricing text,

  -- Category 2 fields — raw intake, expanded during generation
  client_needs_summary text,
  project_scope text,
  goals_and_objectives text,
  recommended_services text,

  -- optional supporting material
  call_transcript text,

  -- set on rejection so the salesperson has something to act on (Stage 5)
  approver_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposals_created_by_idx on public.proposals (created_by);
create index proposals_status_idx on public.proposals (status);

-- ============================================================================
-- proposal_sections — one row per section so regeneration never touches
-- the rest of the proposal
-- ============================================================================
create table public.proposal_sections (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  section_key public.section_key not null,
  content text,
  source_fields jsonb not null default '[]'::jsonb,
  generation_status public.generation_status not null default 'missing',
  scanty_reason text,
  regeneration_count integer not null default 0,
  version integer not null default 1,
  previous_content text,
  updated_at timestamptz not null default now(),
  unique (proposal_id, section_key)
);

create index proposal_sections_proposal_id_idx on public.proposal_sections (proposal_id);

-- ============================================================================
-- approvals
-- ============================================================================
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  approver_id uuid not null references public.profiles (id),
  decision public.approval_decision not null,
  note text,
  decided_at timestamptz not null default now(),
  constraint reject_requires_note check (decision <> 'rejected' or note is not null)
);

create index approvals_proposal_id_idx on public.approvals (proposal_id);

-- ============================================================================
-- access_grants — client-facing, never exposed via RLS to any browser role;
-- only the service-role key (server-side API routes) touches this table
-- ============================================================================
create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  client_email text not null,
  verification_code_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index access_grants_proposal_id_idx on public.access_grants (proposal_id);

-- ============================================================================
-- delivery_log — append-only, every post-approval step
-- ============================================================================
create table public.delivery_log (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  event_type public.delivery_event_type not null,
  status public.delivery_status not null,
  detail text,
  created_at timestamptz not null default now()
);

create index delivery_log_proposal_id_idx on public.delivery_log (proposal_id);

-- ============================================================================
-- notifications — log of real emails sent, not a substitute for sending
-- ============================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.profiles (id),
  proposal_id uuid references public.proposals (id) on delete cascade,
  event_type public.notification_event_type not null,
  status public.delivery_status not null,
  created_at timestamptz not null default now()
);

create index notifications_proposal_id_idx on public.notifications (proposal_id);

-- ============================================================================
-- revision_requests — client rejection of an already-approved proposal
-- ============================================================================
create table public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  evidence text not null,
  decided_by uuid references public.profiles (id),
  decision public.revision_decision not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index revision_requests_proposal_id_idx on public.revision_requests (proposal_id);

-- ============================================================================
-- updated_at maintenance
-- ============================================================================
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute procedure public.set_updated_at();

create trigger proposal_sections_set_updated_at
  before update on public.proposal_sections
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_sections enable row level security;
alter table public.approvals enable row level security;
alter table public.access_grants enable row level security;
alter table public.delivery_log enable row level security;
alter table public.notifications enable row level security;
alter table public.revision_requests enable row level security;

-- profiles: every authenticated user can read all profiles (needed to show
-- names in the approver queue / proposal detail), nobody writes from the client
create policy profiles_select_all on public.profiles
  for select to authenticated
  using (true);

-- proposals
-- Salespeople see only their own; approvers see pending_approval and
-- client_rejected regardless of creator (per build-spec's explicit RLS note).
create policy proposals_select on public.proposals
  for select to authenticated
  using (
    created_by = auth.uid()
    or (public.jwt_role() = 'approver' and status in ('pending_approval', 'client_rejected'))
  );

create policy proposals_insert on public.proposals
  for insert to authenticated
  with check (created_by = auth.uid() and public.jwt_role() = 'salesperson');

-- Update is intentionally broad at the RLS layer (owner OR approver); the
-- actual state-machine legality of a given transition is enforced by the
-- application's conditional UPDATE ... WHERE status = <expected> pattern
-- (see Concurrency section, full-flow.md), not by RLS.
create policy proposals_update on public.proposals
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.jwt_role() = 'approver'
  )
  with check (
    created_by = auth.uid()
    or public.jwt_role() = 'approver'
  );

-- proposal_sections: visibility follows the parent proposal
create policy proposal_sections_select on public.proposal_sections
  for select to authenticated
  using (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_sections.proposal_id
        and (
          p.created_by = auth.uid()
          or (public.jwt_role() = 'approver' and p.status in ('pending_approval', 'client_rejected'))
        )
    )
  );

-- Only the owning salesperson ever writes sections (generation + regeneration
-- both run server-side under the requesting user's session, never the approver).
create policy proposal_sections_insert on public.proposal_sections
  for insert to authenticated
  with check (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_sections.proposal_id and p.created_by = auth.uid()
    )
  );

create policy proposal_sections_update on public.proposal_sections
  for update to authenticated
  using (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_sections.proposal_id and p.created_by = auth.uid()
    )
  );

-- approvals: approver inserts; owner + approver can read
create policy approvals_select on public.approvals
  for select to authenticated
  using (
    public.jwt_role() = 'approver'
    or exists (
      select 1 from public.proposals p
      where p.id = approvals.proposal_id and p.created_by = auth.uid()
    )
  );

create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (public.jwt_role() = 'approver' and approver_id = auth.uid());

-- access_grants: no client-role policies at all — only the service-role key
-- (used server-side in API routes) can read/write this table. The public
-- client access page never talks to Supabase directly with a user session.

-- delivery_log / notifications: owner can read their own proposal's log;
-- all writes happen server-side via the service-role key.
create policy delivery_log_select on public.delivery_log
  for select to authenticated
  using (
    exists (
      select 1 from public.proposals p
      where p.id = delivery_log.proposal_id
        and (p.created_by = auth.uid() or public.jwt_role() = 'approver')
    )
  );

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_user_id = auth.uid());

-- revision_requests: salesperson creates for their own proposal; approver
-- reads all and decides
create policy revision_requests_select on public.revision_requests
  for select to authenticated
  using (
    public.jwt_role() = 'approver'
    or requested_by = auth.uid()
  );

create policy revision_requests_insert on public.revision_requests
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.proposals p
      where p.id = revision_requests.proposal_id and p.created_by = auth.uid()
    )
  );

create policy revision_requests_update on public.revision_requests
  for update to authenticated
  using (public.jwt_role() = 'approver')
  with check (public.jwt_role() = 'approver');
