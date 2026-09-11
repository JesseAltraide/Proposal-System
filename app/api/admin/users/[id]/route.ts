import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin-only: permanently deletes an account. `auth.users` -> `profiles` ->
// `user_roles` all cascade automatically, but proposals/approvals/revision
// requests referencing this person as creator/approver/requester do NOT
// (deliberately RESTRICT, not CASCADE - losing that history silently just
// because an account got deleted would be worse than blocking the delete) -
// so this can fail if the account has any real activity tied to it. That's
// surfaced as a clear error, not swallowed.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("admin");
  const { id } = await params;

  if (id === actor.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    const isForeignKeyBlock = /foreign key|violates|constraint/i.test(error.message);
    const message = isForeignKeyBlock
      ? "Can't delete this account - it has existing proposals, approvals, or reviews tied to it. That history has to stay, so the account can't be removed while it exists."
      : error.message;
    return NextResponse.json({ error: message }, { status: isForeignKeyBlock ? 409 : 500 });
  }

  return NextResponse.json({ ok: true });
}
