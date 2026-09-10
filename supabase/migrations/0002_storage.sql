-- Private bucket for generated proposal PDFs. Never made public — the client
-- access flow always goes through a signed, time-limited URL issued only
-- after email + status verification (see app/api/proposal-access).
insert into storage.buckets (id, name, public)
values ('proposal-pdfs', 'proposal-pdfs', false)
on conflict (id) do nothing;
