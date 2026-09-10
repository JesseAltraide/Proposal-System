import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidNamePart } from "@/lib/names";

const nameSchema = z.string().min(1).refine(isValidNamePart, "Must be letters only, no numbers");

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: nameSchema,
  lastName: nameSchema,
  role: z.enum(["salesperson", "approver"]),
});

// Only an existing approver can invite new users (salespeople or more
// approvers) - matches Stage 0: the seeded admin/approver is the one
// onboarding everyone else, per full-flow.md.
export async function POST(request: Request) {
  await requireRole("approver");

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, firstName, lastName, role } = parsed.data;
  const admin = createAdminClient();

  // Block re-inviting an email that's already registered - each account
  // holds exactly one role (see `profiles.role`), so "already exists for
  // this role" and "already exists at all" are the same check here.
  const { data: existing } = await admin
    .from("profiles")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const message =
      existing.role === role
        ? `${email} is already registered as a ${role}.`
        : `${email} is already registered as a ${existing.role}. One account can only hold one role - invite a different email address if you need to test both roles.`;
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName, role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data.user });
}
