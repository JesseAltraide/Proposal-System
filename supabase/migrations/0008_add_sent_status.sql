-- New status: 'sent', sitting between 'approved' and everything downstream
-- of actual client delivery. User's explicit ask: approval no longer
-- auto-sends anything to the client - it now only notifies the salesperson
-- that their proposal is approved and ready to go out. The salesperson then
-- explicitly clicks Send to Client (app/api/proposals/[id]/send-to-client),
-- which is what actually fires the client-facing emails and moves the
-- proposal from 'approved' to 'sent'. Everything downstream that used to key
-- off 'approved' as "this has reached the client" (client-response tracking,
-- the reminder cron, the client-facing PDF access gate, starting a
-- reproposal) now keys off 'sent' instead - see the app-code changes in the
-- same session as this migration.
alter type public.proposal_status add value 'sent' after 'approved';

-- Tracks when the proposal was actually sent to the client, separate from
-- `approved_at` (when an approver signed off, which may now be well before
-- the salesperson actually clicks Send). Client-response tracking's "how
-- long has this been pending" clock (ClientResponseBadge, the reminder cron)
-- now anchors on this instead of `approved_at`, since the client can't have
-- a response before they were actually sent anything.
alter table public.proposals add column sent_at timestamptz;

