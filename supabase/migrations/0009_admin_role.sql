-- New role: 'admin'. User management (invite/delete users) moves entirely
-- to this role - approvers can no longer invite anyone, that's admin-only
-- now. The seeded account becomes an admin going forward, not an approver
-- (see the updated scripts/seed-admin.mjs) - an admin's only job is user
-- management, it does not review/approve proposals itself. To keep
-- reviewing proposals happening, an admin invites at least one separate
-- approver account after seeding.
alter type public.user_role add value 'admin';
