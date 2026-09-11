-- Every generated/scanty section also gets up to 3 brief, bullet-style
-- suggestions from Claude on how the section could be improved overall
-- (grammar/structure/tone are example areas, not an exhaustive scope).
-- Stored as jsonb, same pattern as source_fields, so it's a real array
-- rather than a delimited string.
-- Empty array for `missing` sections (never sent to Claude at all, same as
-- scanty_reason already behaves as NULL there).
alter table public.proposal_sections add column suggestions jsonb not null default '[]'::jsonb;
