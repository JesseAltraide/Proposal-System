-- User's explicit correction, settled after two rounds in the same
-- conversation: client_response_status should be pending/accepted/rejected
-- ("this better explains it" than the original closed/rejected, and than
-- won/lost which was tried and rejected in between).
alter type public.client_response_status rename value 'closed' to 'accepted';
-- 'rejected' already exists as a value with the right name — nothing to
-- rename there, the original migration just paired it with the wrong
-- opposite ('closed' instead of 'accepted').

-- New proposal-level states so a reproposal's own progress is visible
-- separately from a first-time submission, per the user's explicit ask:
-- "the status of the proposal itself can be changed to awaiting
-- reproposal, then reproposal sent, this is to keep track of what is
-- actually happening." No approver gate sits between `rejected` and
-- `awaiting_reproposal` (also explicit, later in the same conversation) —
-- the old client_rejected/revision_requests approver-review detour for
-- this specific transition has been removed entirely:
--   (client_response_status = rejected) -> salesperson starts reproposal ->
--     awaiting_reproposal (client_response_status resets to pending)
--   awaiting_reproposal -> (salesperson resubmits) -> reproposal_sent
--   reproposal_sent -> (approver decides, normal approve/reject) ->
--     approved | awaiting_reproposal (with an approver note + email, same
--     as any other rejection)
alter type public.proposal_status add value 'awaiting_reproposal';
alter type public.proposal_status add value 'reproposal_sent';
