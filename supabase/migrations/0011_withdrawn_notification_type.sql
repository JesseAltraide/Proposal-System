-- Split into its own file - ALTER TYPE ... ADD VALUE cannot safely run in
-- the same transaction/batch as other DDL in all Postgres versions, same
-- caution already followed by migrations 0007 and 0009.
alter type public.notification_event_type add value 'withdrawn';
