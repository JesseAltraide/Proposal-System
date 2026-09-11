import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm, DeleteUserButton } from "./AdminUsersClient";
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
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("id, first_name, last_name, email, created_at").order("created_at"),
    admin.from("user_roles").select("user_id, role"),
  ]);

  const rolesByUser = new Map<string, UserRole[]>();
  for (const r of roles ?? []) {
    const existing = rolesByUser.get(r.user_id) ?? [];
    existing.push(r.role);
    rolesByUser.set(r.user_id, existing);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="mb-1 text-lg font-semibold text-neutral-900">Manage Users</h1>
        <p className="mb-4 text-sm text-neutral-500">
          Admin-only. Invite new accounts or grant an existing account another role, and remove
          accounts that have no proposals, approvals, or reviews tied to them.
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
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => {
                const userRoles = (rolesByUser.get(p.id) ?? []).sort(
                  (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
                );
                const fullName = formatFullName(p.first_name, p.last_name);
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
                    <td className="px-4 py-3 text-right">
                      {p.id !== actor.id && <DeleteUserButton userId={p.id} fullName={fullName} />}
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
