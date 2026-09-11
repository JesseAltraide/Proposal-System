-- Salesperson-initiated withdrawal of a proposal still sitting in an
-- approver's queue - a genuinely different thing from an approver's
-- rejection (rejectedEmail/approver_note), so it gets its own column rather
-- than overloading approver_note with a salesperson-authored value.
alter table public.proposals add column withdrawal_reason text;
