import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidNamePart } from "@/lib/names";
import { getAppUrl } from "@/lib/app-url";

const nameSchema = z.string().min(1).refine(isValidNamePart, "Must be letters only, no numbers");

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: nameSchema,
  lastName: nameSchema,
  role: z.enum(["salesperson", "approver", "admin"]),
});

// User management moved entirely to the 'admin' role - approvers can no
// longer invite anyone. The seeded account is now an admin, whose only job
// is user management (invite/delete); reviewing proposals is a separate
// role an admin has to invite someone (possibly themselves, via a second
// email) into.
export async function POST(request: Request) {
  await requireRole("admin");

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, firstName, lastName, role } = parsed.data;
  const admin = createAdminClient();

  // This route only ever creates a brand-new account now. Granting an
  // ADDITIONAL role onto an email that already has one is a separate flow -
  // POST /api/admin/users/[id]/grant-role, triggered from that person's own
  // row in the users table - deliberately, so it never asks for (or risks
  // silently ignoring) a name for someone whose name is already on file.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return NextResponse.json(
      {
        error: `${email} already has an account. Use the "Grant Role" button on their row in the users table to add ${role} access instead.`,
      },
      { status: 409 },
    );
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName, role },
    redirectTo: `${getAppUrl()}/auth/callback`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data.user });
}
