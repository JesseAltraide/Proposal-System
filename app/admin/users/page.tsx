import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm, GrantRoleButton, DeleteUserButton } from "./AdminUsersClient";
import { formatFullName } from "@/lib/names";
import type { UserRole } from "@/lib/supabase/database.types";

const ROLE_ORDER: UserRole[] = ["admin", "approver", "salesperson"];

export default async function AdminUsersPage() {
  const actor = await requireRole("admin");

  // Admin-only page - reads via the service-role client rather than the
  // session client, since there's no RLS policy granting a plain SELECT
  // across every profile's full role set (user_roles' own policy already
  // lets an admin/approver see everyone's rows, but keeping this one
  // consistent with "admin actions run on the admin client" throughout).
  const admin = createAdminClient();
  const [{ data: profiles }, { data: roles }, { data: authList }] = await Promise.all([
    admin.from("profiles").select("id, first_name, last_name, email, created_at").order("created_at"),
    admin.from("user_roles").select("user_id, role"),
    // `profiles`/`user_roles` have no concept of "has this person actually
    // accepted their invite" - that only exists on the auth.users record
    // itself (confirmed_at stays null until they follow the invite link and
    // set a password), which only the Admin API can read.
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const rolesByUser = new Map<string, UserRole[]>();
  for (const r of roles ?? []) {
    const existing = rolesByUser.get(r.user_id) ?? [];
    existing.push(r.role);
    rolesByUser.set(r.user_id, existing);
  }

  const pendingByUser = new Map<string, boolean>();
  for (const u of authList?.users ?? []) {
    pendingByUser.set(u.id, !u.confirmed_at);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="mb-1 text-lg font-semibold text-neutral-900">Manage Users</h1>
        <p className="mb-4 text-sm text-neutral-500">
          Admin-only. Invite brand-new accounts below - to grant an existing account another role,
          use the "Grant Role" button on their row instead. Accounts can only be removed if they have
          no proposals, approvals, or reviews tied to them.
        </p>
        <InviteUserForm />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">All Accounts</h2>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => {
                const userRoles = (rolesByUser.get(p.id) ?? []).sort(
                  (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
                );
                const fullName = formatFullName(p.first_name, p.last_name);
                const pending = pendingByUser.get(p.id) ?? false;
                return (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-neutral-900">{fullName}</td>
                    <td className="px-4 py-3 text-neutral-600">{p.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {userRoles.map((r) => (
                          <span
                            key={r}
                            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize text-neutral-700"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {pending ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Pending
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-start justify-end gap-2">
                        <GrantRoleButton
                          userId={p.id}
                          missingRoles={ROLE_ORDER.filter((r) => !userRoles.includes(r))}
                        />
                        {p.id !== actor.id && <DeleteUserButton userId={p.id} fullName={fullName} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
