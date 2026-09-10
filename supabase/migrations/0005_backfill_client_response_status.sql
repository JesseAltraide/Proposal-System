-- Fix (2026-09-10): proposals approved before decision #41's client-response
-- tracking existed have client_response_status = NULL. The UI now displays
-- these correctly as "Pending" (falls back client-side), but the reminder
-- cron's `WHERE client_response_status = 'pending'` filter does NOT match
-- NULL rows in Postgres — those proposals would silently never get a
-- reminder. Backfill the real data instead of only patching the display.
update public.proposals
set
  client_response_status = 'pending',
  approved_at = coalesce(approved_at, updated_at)
where status in ('approved', 'client_rejected')
  and client_response_status is null;
